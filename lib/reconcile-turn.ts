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

const SYNC_META =
  /\b(?:mets?\s*(?:à|a)\s*jour|note\s*(?:ça|ca)|enregistre|actualise)\b/i;

/** « mets à jour », « note ça » — la personne demande explicitement de persister. */
export function isSyncMetaCommand(userText: string): boolean {
  return SYNC_META.test(fold(userText));
}

function previousUserMessage(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  let seenLast = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const text = messages[i].content.trim();
    if (!text) continue;
    if (!seenLast) {
      seenLast = true;
      continue;
    }
    return text;
  }
  return "";
}

function lastAssistantMessage(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i].content.trim();
  }
  return "";
}

/**
 * Texte utilisé pour filtrer les ops greffier — élargi sur « mets à jour »
 * pour inclure l'échange qu'on veut justement persister.
 */
export function userTextForTurnScope(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  const last = lastUserMessage(messages);
  if (!last.trim()) return "";
  if (!isSyncMetaCommand(last)) return last;
  const prev = previousUserMessage(messages);
  const assistant = lastAssistantMessage(messages);
  return [prev, assistant, last].filter(Boolean).join(" ");
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
/** Retrouve le truc de séance à partir des messages récents (ouverture, confirmation…). */
export function findThreadFromSessionContext(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
): Thread | undefined {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content?.trim() ?? "";
    if (!content) continue;
    const matches = open.filter((t) => threadMentionedInTurn(t, content));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const callish = matches.filter((t) =>
        /\b(appeler|contacter|relancer)\b/i.test(`${t.text} ${t.note ?? ""}`),
      );
      if (callish.length === 1) return callish[0];
    }
  }

  const userBlob = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  if (
    /\b(?:appele|appelé|j['']ai appel|c['']est bon j['']ai)\b/i.test(userBlob)
  ) {
    const callThreads = open.filter((t) => /\bappeler\b/i.test(t.text));
    if (callThreads.length === 1) return callThreads[0];
  }

  return undefined;
}

export function scopeGreffierUpdates(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  updates: unknown[],
): unknown[] {
  const userText = userTextForTurnScope(messages);
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

const CALL_REPORT =
  /\b(?:c est bon|c bon|nickel)\b.*\b(?:appele|contacte)\b|\b(?:j ai|je l ai)\s+(?:deja\s+)?(?:appele|contacte)\b/;

const WAITING_CALLBACK =
  /\b(?:doit|va)\s+(?:me\s+)?(?:rappeler|recontacter)|en attente (?:de|du|d )?(?:\s|$)|(?:rappellent|recontacte)\b/;

function frDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * « j'ai appelé, ils rappellent / plan B demain » — persiste même si le greffier
 * ou le filtre tour-actuel ratent le coup (ex. « mets à jour » sans nommer Darty).
 */
export function extractCallStatusTurnOps(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  at = new Date(),
): ThreadOp[] {
  const last = lastUserMessage(messages);
  if (!last.trim()) return [];

  let substance = last;
  if (isSyncMetaCommand(last)) {
    substance = [previousUserMessage(messages), lastAssistantMessage(messages)]
      .filter(Boolean)
      .join(" ");
    if (!substance.trim()) return [];
  } else if (!CALL_REPORT.test(fold(last))) {
    return [];
  }

  const foldedSubstance = fold(substance);

  const target = findThreadFromSessionContext(threads, messages);
  if (!target) return [];

  const todayIso = isoDayParis(at);
  const parts: string[] = [`Appelé le ${frDateLabel(todayIso)}.`];

  if (WAITING_CALLBACK.test(foldedSubstance) || isSyncMetaCommand(last)) {
    parts.push("En attente de rappel aujourd'hui.");
  }

  const planDay =
    parseTargetDay(substance, at) ??
    (/\bdemain\b/.test(foldedSubstance)
      ? parseTargetDay("demain", at)
      : null);
  if (planDay) {
    parts.push(`Plan B ${frDateLabel(planDay)} si pas de nouvelles.`);
  }

  const note = parts.join(" ");
  const ops: ThreadOp[] = [
    { op: "set", id: target.id, kind: "suivi" },
    { op: "note", id: target.id, note },
  ];

  if (planDay) {
    ops.push({
      op: "set",
      id: target.id,
      plannedFor: `${planDay}T12:00:00.000Z`,
    });
  }

  return ops;
}

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
  const relance = extractRelanceTurnOps(threads, userText, at);
  const callStatus = extractCallStatusTurnOps(threads, messages, at);

  let merged = scoped;
  const codeOps = [...relance, ...callStatus];
  if (codeOps.length === 0) return merged;

  const targetIds = new Set(
    codeOps
      .filter((o) => o.op === "set" && "id" in o)
      .map((o) => (o as { id: string }).id),
  );
  merged = scoped.filter((raw) => {
    if (typeof raw !== "object" || raw === null) return true;
    const item = raw as Record<string, unknown>;
    if (item.op === "done" && typeof item.id === "string" && targetIds.has(item.id)) {
      return false;
    }
    return true;
  });

  const seen = new Set<string>();
  for (const op of codeOps) {
    const key = JSON.stringify(op);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(op);
  }
  return merged;
}
