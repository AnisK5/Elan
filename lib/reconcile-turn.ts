import type { ChatMessage, Thread } from "@/lib/types";
import type { ThreadOp } from "@/lib/store";
import {
  findReguliersThread,
  isReguliersContainerName,
} from "@/lib/entretiens";
import { COURSES_THREAD_TEXT } from "@/lib/shopping-write";
import { resolveThreadId } from "@/lib/ops";

const STOP = new Set([
  "avec",
  "dans",
  "pour",
  "plus",
  "tout",
  "tous",
  "toute",
  "toutes",
  "elle",
  "cest",
  "deja",
  "fait",
  "bien",
  "veux",
  "prefere",
  "prefère",
  "plutot",
  "plutôt",
  "reporte",
  "reporter",
  "relancer",
  "relance",
]);

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function lastUserMessage(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content.trim();
  }
  return "";
}

/** Le truc est-il nommé dans le dernier message utilisateur ? */
export function threadMentionedInTurn(
  thread: Thread,
  userText: string,
): boolean {
  if (!userText.trim()) return false;
  const user = fold(userText);
  const blob = fold(`${thread.text} ${thread.note ?? ""}`);
  const userToks = tokens(userText);
  const threadToks = tokens(`${thread.text} ${thread.note ?? ""}`);

  let hits = 0;
  for (const t of userToks) {
    if (threadToks.some((tt) => tt === t || tt.includes(t) || t.includes(tt))) {
      hits++;
    }
  }
  if (hits >= 2) return true;
  if (hits === 1 && userToks.some((t) => t.length >= 5 && blob.includes(t))) {
    return true;
  }

  // Nom propre court (Laura, Thiga…) : un token suffit s'il est dans le libellé.
  for (const t of userToks) {
    if (t.length >= 4 && blob.includes(t)) return true;
  }

  // Libellé court contenu dans le message (« france travail »).
  const label = fold(thread.text);
  if (label.length >= 8 && user.includes(label)) return true;

  return false;
}

function containerAllowedInTurn(
  thread: Thread,
  userText: string,
): boolean {
  const user = fold(userText);
  if (isReguliersContainerName(thread.text)) {
    return /regulier|rythme|entretien|linge|drap|urssaf|loyer|frigo/.test(
      user,
    );
  }
  if (thread.text.trim().toLowerCase() === COURSES_THREAD_TEXT.toLowerCase()) {
    return /courses|acheter|magasin|supermarche|supermarch/.test(user);
  }
  return false;
}

function resolveOpThread(
  raw: Record<string, unknown>,
  threads: Thread[],
): Thread | undefined {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return undefined;
  const resolved = resolveThreadId(id, threads);
  if (!resolved) return undefined;
  return threads.find((t) => t.id === resolved);
}

/**
 * Ne garde que les ops qui touchent un truc nommé dans le TOUR ACTUEL
 * (dernier message utilisateur). Évite qu'un vieux contexte fasse cocher
 * France Travail ou le linge alors qu'on parle de Laura.
 */
export function scopeGreffierUpdates(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  updates: unknown[],
): unknown[] {
  const userText = lastUserMessage(messages);
  if (!userText.trim()) return [];
  const reguliersId = findReguliersThread(threads)?.id;

  return updates.filter((raw) => {
    if (typeof raw !== "object" || raw === null) return false;
    const item = raw as Record<string, unknown>;
    const op = item.op;
    if (op === "add") {
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return false;
      if (isReguliersContainerName(text)) {
        return containerAllowedInTurn(
          { id: "x", text, kind: "action", status: "open", createdAt: "" },
          userText,
        );
      }
      if (text.toLowerCase() === COURSES_THREAD_TEXT.toLowerCase()) {
        return containerAllowedInTurn(
          { id: "x", text, kind: "action", status: "open", createdAt: "" },
          userText,
        );
      }
      return fold(text)
        .split(/\s+/)
        .some((t) => t.length >= 4 && fold(userText).includes(t));
    }
    const thread = resolveOpThread(item, threads);
    if (!thread) return false;
    if (thread.id === reguliersId) {
      return containerAllowedInTurn(thread, userText);
    }
    return (
      threadMentionedInTurn(thread, userText) ||
      containerAllowedInTurn(thread, userText)
    );
  });
}

function isoDayParis(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function frDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = String(d).padStart(2, "0");
  const month = String(m).padStart(2, "0");
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" });
  return `${wd} ${day}/${month}/${y}`;
}

function nextWeekdayIso(weekday: number, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const today = new Date(y, m - 1, d, 12, 0, 0, 0);
  const cur = today.getDay();
  let delta = weekday - cur;
  if (delta <= 0) delta += 7;
  today.setDate(today.getDate() + delta);
  const yy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function parseTargetDay(userText: string, at = new Date()): string | null {
  const f = fold(userText);
  if (/\bdemain\b/.test(f)) {
    const t = new Date(at);
    t.setDate(t.getDate() + 1);
    return isoDayParis(t);
  }
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(f)) return nextWeekdayIso(wd, at);
  }
  const slash = userText.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : at.getFullYear();
    if (slash[3] && year < 100) year += 2000;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  return null;
}

const FUTURE_RELANCE =
  /\b(?:je\s+)?(?:prefere|prefère|plutot|plutôt|vais|veux|compte|reporte|reporter|plutot\s+la|plutôt\s+la)\b.*\b(?:relanc|recontact)/i;

const PAST_RELANCE =
  /\b(?:j['']ai|je\s+l['']ai|c['']est|c\s+est)\s+(?:deja\s+)?(?:relanc|contact|envoy|appele|appelé|écrit)/i;

/**
 * « je préfère la relancer lundi » → intention de relance ce jour-là,
 * pas une relance déjà faite.
 */
export function extractRelanceTurnOps(
  threads: Thread[],
  userText: string,
  at = new Date(),
): ThreadOp[] {
  const text = userText.trim();
  if (!text || PAST_RELANCE.test(text)) return [];
  if (!/\brelanc\w*\b/i.test(text) && !FUTURE_RELANCE.test(text)) {
    return [];
  }
  const target = parseTargetDay(text, at);
  if (!target) return [];

  const open = threads.filter((t) => t.status === "open");
  const matches = open.filter((t) => threadMentionedInTurn(t, text));
  if (matches.length !== 1) return [];

  const t = matches[0];
  const label = frDayLabel(target);
  const note = `Relance prévue ${label}.`;
  const ops: ThreadOp[] = [
    { op: "set", id: t.id, plannedFor: `${target}T12:00:00.000Z` },
    { op: "note", id: t.id, note },
  ];
  if (t.kind !== "suivi" && /\brelanc/i.test(t.text)) {
    ops.unshift({ op: "set", id: t.id, kind: "suivi" });
  }
  return ops;
}

export function mergeTurnWrites(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  greffierUpdates: unknown[],
  at = new Date(),
): unknown[] {
  const userText = lastUserMessage(messages);
  const scoped = scopeGreffierUpdates(threads, messages, greffierUpdates);
  const ours = extractRelanceTurnOps(threads, userText, at);
  if (ours.length === 0) return scoped;

  const targetId = ours.find((o) => o.op === "set" && "id" in o)?.id;
  const filtered = scoped.filter((raw) => {
    if (typeof raw !== "object" || raw === null || !targetId) return true;
    const item = raw as Record<string, unknown>;
    if (item.op === "done" && item.id === targetId) return false;
    return true;
  });
  return [...filtered, ...ours];
}
