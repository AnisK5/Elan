import type { Effort, ThreadKind } from "@/lib/types";
import {
  isReguliersContainerName,
  parseReguliers,
} from "@/lib/entretiens";
import { hasPendingPhysicalWork } from "@/lib/plan-candidates";
import { clean, type ThreadOp } from "@/lib/store";

// Porte d'entrée des écritures venues du modèle.
//
// /api/reconcile renvoyait `unknown[]`, casté directement en ThreadOp[] côté
// client : le modèle pouvait donc cocher un truc dont il avait inventé l'id,
// écrire une date absurde ou renvoyer trente opérations d'un coup. Rien de
// tout ça n'arrive plus ici sans être vérifié.

const KINDS: ThreadKind[] = ["action", "suivi"];
const EFFORTS: Effort[] = ["S", "M", "L"];

// Assez pour un échange riche, trop peu pour un emballement.
const MAX_OPS = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le modèle envoie souvent le libellé (« coffre ») au lieu de l'id.
 * On ne rattache que s'il n'y a qu'UN truc ouvert qui matche.
 */
export function resolveThreadId(
  raw: string,
  threads: { id: string; text: string; status?: string }[],
): string | undefined {
  const id = raw.trim();
  if (!id) return undefined;
  if (threads.some((t) => t.id === id)) return id;
  const n = fold(id);
  if (n.length < 4) return undefined;
  const open = threads.filter((t) => !t.status || t.status === "open");
  const hits = open.filter((t) => {
    const tN = fold(t.text);
    return tN.includes(n) || (n.length >= 12 && n.includes(tN));
  });
  return hits.length === 1 ? hits[0].id : undefined;
}

/** Une date n'est retenue que si elle est réelle et pas délirante. */
function date(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  const year = d.getFullYear();
  if (year < 2000 || year > 2100) return undefined;
  return d.toISOString();
}

/**
 * Ne laisse passer que des opérations exploitables : op connue, id existant,
 * champs bien typés. Tout le reste est écarté silencieusement — une opération
 * douteuse ne vaut jamais le risque de l'appliquer.
 */
export function parseThreadOps(
  raw: unknown,
  knownIds: Set<string>,
  threads?: { id: string; text: string; status?: string }[],
): ThreadOp[] {
  if (!Array.isArray(raw)) return [];
  const out: ThreadOp[] = [];

  for (const item of raw) {
    if (out.length >= MAX_OPS) break;
    if (!isRecord(item)) continue;

    const op = item.op;
    if (typeof op !== "string") continue;

    if (op === "add") {
      const text = clean(str(item.text));
      const kind = item.kind;
      if (!text || typeof kind !== "string") continue;
      if (!KINDS.includes(kind as ThreadKind)) continue;
      const effort = EFFORTS.includes(item.effort as Effort)
        ? (item.effort as Effort)
        : undefined;
      out.push({
        op: "add",
        text,
        kind: kind as ThreadKind,
        due: date(item.due),
        plannedFor: date(item.plannedFor),
        effort,
        note: clean(str(item.note)) || undefined,
      });
      continue;
    }

    // Toutes les autres opérations ciblent un truc existant. Un id inconnu
    // est d'abord recalé sur le libellé s'il n'y a qu'une cible ; sinon on
    // jette — on ne devine pas entre deux trucs.
    const rawId = str(item.id);
    const id = rawId
      ? knownIds.has(rawId)
        ? rawId
        : threads
          ? resolveThreadId(rawId, threads)
          : undefined
      : undefined;
    if (!id || !knownIds.has(id)) continue;

    switch (op) {
      case "done":
        out.push({ op: "done", id });
        break;
      case "delete":
        out.push({ op: "delete", id });
        break;
      case "snooze":
        out.push({ op: "snooze", id, until: date(item.until) });
        break;
      case "rename": {
        const text = clean(str(item.text));
        if (text) out.push({ op: "rename", id, text });
        break;
      }
      case "note": {
        const note = clean(str(item.note));
        if (note) out.push({ op: "note", id, note });
        break;
      }
      case "set": {
        const next: Extract<ThreadOp, { op: "set" }> = { op: "set", id };
        let touches = false;

        const due = date(item.due);
        if (due) {
          next.due = due;
          touches = true;
        }
        if (EFFORTS.includes(item.effort as Effort)) {
          next.effort = item.effort as Effort;
          touches = true;
        }
        if (KINDS.includes(item.kind as ThreadKind)) {
          next.kind = item.kind as ThreadKind;
          touches = true;
        }
        // Seul un null EXPLICITE annule une intention. Une valeur qui ne se
        // parse pas (« jeudi », « la semaine prochaine ») doit être ignorée,
        // surtout pas retomber sur null : ça effacerait le jour déjà prévu au
        // lieu de ne rien faire, et un truc qui devait remonter disparaîtrait.
        if ("plannedFor" in item) {
          if (item.plannedFor === null) {
            next.plannedFor = null;
            touches = true;
          } else {
            const planned = date(item.plannedFor);
            if (planned) {
              next.plannedFor = planned;
              touches = true;
            }
          }
        }

        // Un "set" dont rien n'a survécu à la validation ne ferait que marquer
        // le truc comme revu : autant ne pas l'appliquer du tout.
        if (touches) out.push(next);
        break;
      }
      default:
        break;
    }
  }

  return out;
}

function sameDay(a?: string, b?: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * Écarte les ops qui ne changeraient rien à l'état actuel — sinon le greffier
 * rejoue l'historique et la bulle ✏️ recolle des modifs déjà faites.
 */
export function filterEffectiveOps(
  threads: { id: string; text: string; status?: string; note?: string; due?: string; effort?: string; kind?: string; plannedFor?: string }[],
  ops: ThreadOp[],
): ThreadOp[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const openTexts = new Set(
    threads
      .filter((t) => !t.status || t.status === "open")
      .map((t) => t.text.trim().toLowerCase()),
  );
  const out: ThreadOp[] = [];

  for (const op of ops) {
    if (op.op === "add") {
      if (openTexts.has(op.text.trim().toLowerCase())) continue;
      out.push(op);
      openTexts.add(op.text.trim().toLowerCase());
      continue;
    }
    const t = byId.get(op.id);
    if (!t) continue;

    switch (op.op) {
      case "done":
        if (t.status === "done") continue;
        if (hasPendingPhysicalWork(t.text, t.note)) continue;
        out.push(op);
        break;
      case "delete":
        out.push(op);
        break;
      case "snooze":
        if (t.status === "snoozed") continue;
        out.push(op);
        break;
      case "rename":
        if (clean(op.text) === (t.text ?? "").trim()) continue;
        out.push(op);
        break;
      case "note": {
        const next = clean(op.note);
        const prev = (t.note ?? "").trim();
        if (!next || next === prev) continue;
        out.push(op);
        break;
      }
      case "set": {
        let changes = false;
        if (op.due !== undefined && !sameDay(op.due, t.due)) changes = true;
        if (op.effort && op.effort !== t.effort) changes = true;
        if (op.kind && op.kind !== t.kind) changes = true;
        if (op.plannedFor !== undefined) {
          if (op.plannedFor === null) {
            if (t.plannedFor) changes = true;
          } else if (!sameDay(op.plannedFor, t.plannedFor)) {
            changes = true;
          }
        }
        if (changes) out.push(op);
        break;
      }
      default:
        break;
    }
  }

  return out;
}

function shortClerkLabel(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= 32) return t;
  return `${t.slice(0, 30).trim()}…`;
}

function frDay(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Note ✏️ construite depuis les ops VRAIMENT appliquées ce tour —
 * pas le récap libre du modèle (qui retombe souvent sur toute la séance).
 */
export function noteFromTurnOps(
  ops: ThreadOp[],
  threads: { id: string; text: string; note?: string }[],
): string {
  if (ops.length === 0) return "";
  const byId = new Map(threads.map((t) => [t.id, t]));
  const parts: string[] = [];

  for (const op of ops) {
    if (op.op === "add") {
      if (isReguliersContainerName(op.text)) {
        const first = parseReguliers(op.note)[0];
        parts.push(
          first
            ? `${shortClerkLabel(first.label)} · dans Réguliers`
            : "régulier retenu",
        );
      } else {
        parts.push(`${shortClerkLabel(op.text)} ajouté`);
      }
      continue;
    }

    const t = byId.get(op.id);
    const label = shortClerkLabel(t?.text ?? "truc");

    switch (op.op) {
      case "done":
        parts.push(`${label} ✓`);
        break;
      case "delete":
        parts.push(`${label} retiré`);
        break;
      case "snooze":
        parts.push(`${label} plus tard`);
        break;
      case "rename":
        parts.push(`renommé · ${shortClerkLabel(op.text)}`);
        break;
      case "note":
        if (t && isReguliersContainerName(t.text)) {
          const first = parseReguliers(op.note)[0];
          parts.push(
            first
              ? `${shortClerkLabel(first.label)} · régulier à jour`
              : "réguliers mis à jour",
          );
        } else {
          parts.push(`${label} noté`);
        }
        break;
      case "set": {
        if (op.plannedFor) {
          const day = frDay(op.plannedFor);
          parts.push(day ? `${label} → ${day}` : `${label} reporté`);
        } else if (op.plannedFor === null) {
          parts.push(`${label} remis en file`);
        } else if (op.due) {
          const day = frDay(op.due);
          parts.push(day ? `${label} · ${day}` : `${label} daté`);
        } else if (op.kind === "suivi") {
          parts.push(`${label} · à suivre`);
        } else {
          parts.push(`${label} mis à jour`);
        }
        break;
      }
      default:
        break;
    }
  }

  // Une seule ligne courte : ce tour, pas l'historique.
  return parts.slice(0, 2).join(" · ");
}
