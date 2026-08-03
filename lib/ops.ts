import type { Effort, ThreadKind } from "@/lib/types";
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
export function parseThreadOps(raw: unknown, knownIds: Set<string>): ThreadOp[] {
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
        effort,
        note: clean(str(item.note)) || undefined,
      });
      continue;
    }

    // Toutes les autres opérations ciblent un truc existant. Un id inconnu
    // signifie que le modèle l'a inventé : on ne devine pas ce qu'il visait.
    const id = str(item.id);
    if (!id || !knownIds.has(id)) continue;

    switch (op) {
      case "done":
        out.push({ op: "done", id });
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
