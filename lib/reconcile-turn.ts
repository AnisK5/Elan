import type { ChatMessage, Thread } from "@/lib/types";
import type { ThreadOp } from "@/lib/store";
import {
  findReguliersThread,
  isContainerThread,
  isReguliersContainerName,
} from "@/lib/entretiens";
import { COURSES_THREAD_TEXT } from "@/lib/shopping-write";
import { hasRegulierCadence } from "@/lib/reguliers-write";
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

/** « sg sur » → Sogessur : initiale + suffixe collés en un nom du libellé. */
function aliasHitsThread(userText: string, threadToks: string[]): boolean {
  const raw = fold(userText).split(/\s+/).filter(Boolean);
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i];
    const b = raw[i + 1];
    if (a.length !== 2 || b.length < 3 || b.length > 5) continue;
    const initial = a[0];
    if (
      threadToks.some(
        (tt) =>
          tt.startsWith(initial) &&
          tt.endsWith(b) &&
          tt.length >= b.length + 2,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * « maj », « pardon », « c'est pas à jour » : le tour utile est le dump
 * d'avant, pas ces deux mots. Sans ça le greffier « range » du vide.
 */
export function isCarryForwardTurn(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  const f = fold(t);
  if (/^(maj|update|ok maj)[\s.!?]*$/.test(f)) return true;
  if (t.length > 220) return false;
  return (
    /\b(pardon|pas a jour|c est pas a jour|cest pas a jour|la desc|la description|pas ecrit|la suite|c est ecrit|cest ecrit|mets a jour|met a jour)\b/.test(
      f,
    )
  );
}

/** Messages utilisateur du tour réel (dump + corrections), pas seulement « maj ». */
export function tourUserBlob(
  messages: Pick<ChatMessage, "role" | "content">[],
  maxUsers = 8,
): string {
  const users = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (users.length === 0) return "";
  const last = users[users.length - 1];
  if (!isCarryForwardTurn(last)) return last;
  const picked: string[] = [];
  for (let i = users.length - 1; i >= 0 && picked.length < maxUsers; i--) {
    picked.unshift(users[i]);
    if (!isCarryForwardTurn(users[i])) break;
  }
  return picked.join("\n");
}

/** Texte pour ancrer les ops : confirmation → Élan ; correction → dump d'avant. */
export function mentionSourceForTurn(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  const userText = lastUserMessage(messages);
  if (
    isDoneConfirmationTurn(messages) ||
    isDeleteConfirmationTurn(messages)
  ) {
    return assistantBeforeLastUser(messages) || userText;
  }
  if (isCarryForwardTurn(userText)) return tourUserBlob(messages);
  return userText;
}

/** Texte utilisateur pour les écritures déterministes (jamais la réplique d'Élan). */
export function writeSourceForTurn(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  const userText = lastUserMessage(messages);
  if (isCarryForwardTurn(userText)) return tourUserBlob(messages);
  return userText;
}

/** Garde le dump d'avant quand le dernier mot est « maj » / « pas à jour ». */
export function messagesForReconcile<
  T extends { role: string; content: string },
>(messages: T[]): T[] {
  if (messages.length === 0) return messages;
  const last = lastUserMessage(messages);
  if (!isCarryForwardTurn(last)) {
    return messages.length <= 8 ? messages : messages.slice(-8);
  }
  let start = Math.max(0, messages.length - 8);
  let users = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    users++;
    start = i;
    const t = messages[i]?.content ?? "";
    if (!isCarryForwardTurn(t) || users >= 8) break;
  }
  const sliced = messages.slice(start);
  return sliced.length > 16 ? sliced.slice(-16) : sliced;
}

/** Index (dans CE tableau) où commence le tour à ranger. */
export function tourActuelFromIndex(
  messages: Pick<ChatMessage, "role" | "content">[],
): number | undefined {
  const userIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") userIdxs.push(i);
  }
  if (userIdxs.length === 0) return undefined;
  let start = userIdxs[userIdxs.length - 1]!;
  for (let k = userIdxs.length - 1; k >= 0; k--) {
    start = userIdxs[k]!;
    if (!isCarryForwardTurn(messages[start]?.content ?? "")) break;
  }
  return start;
}

export function lastUserMessage(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content.trim();
  }
  return "";
}

export function lastAssistantMessage(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i].content.trim();
  }
  return "";
}

/** La réplique d'Élan à laquelle répond le dernier message user — pas celle d'après. */
export function assistantBeforeLastUser(
  messages: Pick<ChatMessage, "role" | "content">[],
): string {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return "";
  for (let i = lastUser - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i].content.trim();
  }
  return "";
}

function assistantAskedIfDone(text: string): boolean {
  if (!text.includes("?")) return false;
  const f = fold(text);
  return /\b(fait|faits|coche|regle|regles|termine|envoye|rendu)\b/.test(f);
}

/** L'utilisateur affirme qu'un truc est fait (pas un simple « ok, on y va »). */
export function looksLikeDoneClaim(userText: string): boolean {
  const f = fold(userText);
  if (!f) return false;
  if (
    /^(c est fait|cest fait|c est deja fait|cest deja fait|deja fait|c est bon|cest bon|c est regle|cest regle)([.!?]|$)/.test(
      f,
    )
  ) {
    return true;
  }
  if (
    /\b(j ai|je l ai|je les ai)\s+(deja\s+)?(achete|pris|reserve|paye)s?\s+(le|la|les|mes|mon|ma|l)\b/.test(
      f,
    ) ||
    /\b(j ai|je les ai)\s+(deja\s+)?(achete|pris|reserve|paye)s?\s+[a-z]{4,}/.test(
      f,
    )
  ) {
    return true;
  }
  if (/\b(billets?|hebergements?)\s+(pris|achetes?|reserves?)\b/.test(f)) {
    return true;
  }
  return (
    /\b(c est deja fait|cest deja fait|deja fait|c est fait|cest fait|je l ai fait|je lai fait|mets que c est fait|marque.{0,20}fait|coche|c est regle|cest regle|c est envoye|c est rendu|plus besoin|plus a faire)\b/.test(
      f,
    ) ||
    (/\bfait$/.test(f) &&
      /\b(mets|marque|note|coche|dis|considere)\b/.test(f))
  );
}

export function isDoneConfirmationTurn(
  messages: Pick<ChatMessage, "role" | "content">[],
): boolean {
  const userText = lastUserMessage(messages);
  if (looksLikeDoneClaim(userText)) return true;
  const f = fold(userText);
  if (!/^(oui|ouais|yes)([.!?]|$)/.test(f)) return false;
  return assistantAskedIfDone(assistantBeforeLastUser(messages));
}

/** « tu peux supprimer cette tâche » — pas un « c'est fait », un retrait. */
export function looksLikeDeleteClaim(userText: string): boolean {
  const f = fold(userText);
  if (!f) return false;
  // « t'es sûr que c'est supprimé ? » = vérif, pas une nouvelle demande.
  if (
    /\b(sur que|c est (deja )?supprime|cest (deja )?supprime)\b/.test(f) &&
    !/\b(tu peux|peux tu|peux-tu)\b/.test(f)
  ) {
    return false;
  }
  if (/\b(ne (le |la |les )?supprime pas|pas (le |la )?supprim)\b/.test(f)) {
    return false;
  }
  return /\b(supprim\w*|enlev\w*|vire[rs]?\b|retire[rs]?\b|lache[rs]?\b)/.test(
    f,
  );
}

export function isDeleteConfirmationTurn(
  messages: Pick<ChatMessage, "role" | "content">[],
): boolean {
  return looksLikeDeleteClaim(lastUserMessage(messages));
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

  // « sg sur » pour Sogessur — les initiales passent sous le seuil de 3 lettres.
  if (aliasHitsThread(userText, threadToks)) return true;

  return false;
}

function mentionScore(thread: Thread, text: string): number {
  if (!text.trim()) return 0;
  const textToks = tokens(text);
  const threadToks = tokens(`${thread.text} ${thread.note ?? ""}`);
  let score = 0;
  for (const t of textToks) {
    if (threadToks.some((tt) => tt === t || tt.includes(t) || t.includes(tt))) {
      score += t.length >= 6 ? 2 : 1;
    }
  }
  const label = fold(thread.text);
  if (label.length >= 8 && fold(text).includes(label)) score += 4;
  if (aliasHitsThread(text, threadToks)) score += 3;
  if (score === 0 && threadMentionedInTurn(thread, text)) return 1;
  if (score === 0 && containerAllowedInTurn(thread, text)) return 1;
  return score;
}

export function uniqueThreadFromAnchor(
  threads: Thread[],
  anchor: string,
): Thread | null {
  if (!anchor.trim()) return null;
  const open = threads.filter((t) => t.status === "open");
  const scored = open
    .map((t) => ({ t, score: mentionScore(t, anchor) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return scored[0].t;
  }
  return null;
}

/** Si elle dit que c'est fait sans nommer le truc, on coche celui qu'Élan venait de proposer. */
export function inferConfirmedDoneOps(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
): ThreadOp[] {
  if (!isDoneConfirmationTurn(messages)) return [];
  const userText = lastUserMessage(messages);
  const named = threads.filter(
    (t) => t.status === "open" && threadMentionedInTurn(t, userText),
  );
  const pick =
    named.length === 1
      ? named[0]
      : uniqueThreadFromAnchor(threads, assistantBeforeLastUser(messages));
  if (!pick || isReguliersContainerName(pick.text)) return [];
  return [{ op: "done", id: pick.id }];
}

/** Même ancrage que le done, pour « supprime cette tâche ». */
export function inferConfirmedDeleteOps(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
): ThreadOp[] {
  if (!isDeleteConfirmationTurn(messages)) return [];
  const userText = lastUserMessage(messages);
  const named = threads.filter(
    (t) => t.status === "open" && threadMentionedInTurn(t, userText),
  );
  const pick =
    named.length === 1
      ? named[0]
      : uniqueThreadFromAnchor(threads, assistantBeforeLastUser(messages));
  if (!pick || isContainerThread(pick)) return [];
  return [{ op: "delete", id: pick.id }];
}

function containerAllowedInTurn(
  thread: Thread,
  userText: string,
): boolean {
  const user = fold(userText);
  if (isReguliersContainerName(thread.text)) {
    return (
      /regulier|rythme|entretien|linge|drap|urssaf|loyer|frigo|habitude|bilan|dentiste/.test(
        user,
      ) || hasRegulierCadence(userText)
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
 * Ne garde que les ops qui touchent un truc nommé dans le TOUR ACTUEL.
 * Évite qu'un vieux contexte fasse cocher France Travail alors qu'on
 * parle de Laura.
 *
 * Exception : confirmation courte (« oui », « c'est fait ») — on ancre
 * sur le dernier message d'Élan. Correction / « maj » — on ancre sur
 * le dump d'avant, pas sur les deux mots.
 */
export function scopeGreffierUpdates(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  updates: unknown[],
): unknown[] {
  const userText = lastUserMessage(messages);
  if (!userText.trim()) return [];
  const reguliersId = findReguliersThread(threads)?.id;
  const mentionSource = mentionSourceForTurn(messages);

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
          mentionSource,
        );
      }
      if (text.toLowerCase() === COURSES_THREAD_TEXT.toLowerCase()) {
        return containerAllowedInTurn(
          { id: "x", text, kind: "action", status: "open", createdAt: "" },
          mentionSource,
        );
      }
      return fold(text)
        .split(/\s+/)
        .some((t) => t.length >= 4 && fold(mentionSource).includes(t));
    }
    const thread = resolveOpThread(item, threads);
    if (!thread) return false;
    if (thread.id === reguliersId) {
      return containerAllowedInTurn(thread, mentionSource);
    }
    return (
      threadMentionedInTurn(thread, mentionSource) ||
      threadMentionedInTurn(thread, userText) ||
      containerAllowedInTurn(thread, mentionSource)
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

const GAP_WHEN =
  /\bpas avant\b|\ba partir\b|\bvers le\b|\bautour de\b/;

const HARD_DUE =
  /\bau plus tard\b|\bdeadline\b|\becheance\b|\bavant demain\b|\bavant lundi\b|\bavant mardi\b|\bavant mercredi\b|\bavant jeudi\b|\bavant vendredi\b/;

function anchorRelativeWhen(note: string, iso: string): string {
  const label = frDayLabel(iso);
  return note
    .replace(/\bdemain matin\b/gi, `${label} matin`)
    .replace(/\bpour demain\b/gi, `pour le ${label}`)
    .replace(/\ba faire demain\b/gi, `à faire ${label}`)
    .replace(/\bà faire demain\b/gi, `à faire ${label}`)
    .replace(/\bdemain\b/gi, label);
}

/**
 * Un « demain » / « lundi » sur un add : jour prévu (plannedFor),
 * pas une note qui dit encore « demain ».
 */
export function stampWhenOnAdds(
  messages: Pick<ChatMessage, "role" | "content">[],
  updates: unknown[],
  at = new Date(),
): unknown[] {
  const userText = writeSourceForTurn(messages);
  const blob = fold(`${userText}\n${updates.map((u) => {
    if (typeof u !== "object" || u === null) return "";
    const item = u as { note?: unknown; text?: unknown };
    return `${item.text ?? ""} ${item.note ?? ""}`;
  }).join("\n")}`);
  if (GAP_WHEN.test(blob)) return updates;

  return updates.map((raw) => {
    if (typeof raw !== "object" || raw === null) return raw;
    const item = raw as Record<string, unknown>;
    if (item.op !== "add" || typeof item.text !== "string") return raw;
    const text = item.text.trim();
    if (!text) return raw;
    if (isReguliersContainerName(text)) return raw;
    if (text.toLowerCase() === COURSES_THREAD_TEXT.toLowerCase()) return raw;

    const note = typeof item.note === "string" ? item.note : "";
    const target =
      parseTargetDay(userText, at) ??
      parseTargetDay(note, at) ??
      parseTargetDay(text, at);
    if (!target) return raw;

    const next: Record<string, unknown> = { ...item };
    const hasDue = typeof item.due === "string" && item.due.trim();
    const hasPlan = typeof item.plannedFor === "string" && item.plannedFor.trim();
    if (!hasDue && !hasPlan) {
      const source = fold(`${userText}\n${note}\n${text}`);
      if (HARD_DUE.test(source)) next.due = target;
      else next.plannedFor = target;
    }
    if (note) next.note = anchorRelativeWhen(note, target);
    return next;
  });
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

function looksLikeCallReport(text: string): boolean {
  const f = fold(text);
  if (!f) return false;
  return (
    /\b(viens d appeler|je viens d appeler|j ai appele|j ai contacte)\b/.test(
      f,
    ) ||
    (/\b(appele|appeler)\b/.test(f) &&
      /\b(pas recu|pas encore recu|attendent|en attente|semaine prochaine)\b/.test(
        f,
      ))
  );
}

function callReportNeedsFollowUp(text: string): boolean {
  const f = fold(text);
  return (
    /\b(pas recu|pas encore recu|en attente|attendent|semaine prochaine|par mail|tiendr)\b/.test(
      f,
    ) ||
    (/\b(pere|papa)\b/.test(f) &&
      /\b(verif|contact|relanc|recontact)\b/.test(f))
  );
}

function suiviTitleFromCall(text: string): string | null {
  const m = text.match(/^(?:appeler|contacter|relancer)\s+(.+)$/i);
  if (!m) return null;
  const entity = m[1].split(/\s+pour\b/i)[0]?.trim() ?? "";
  if (!entity || entity.length > 48) return null;
  return `Suivi ${entity}`;
}

function buildCallFollowUpNote(
  blob: string,
  at: Date,
  day: string | null,
): string {
  const f = fold(blob);
  const today = isoDayParis(at);
  const [, month, d] = today.split("-");
  const parts = [`Appelé le ${d}/${month}.`];
  if (
    /pas recu|pas encore recu|attendent le document|pas encore recu le document/.test(
      f,
    )
  ) {
    parts.push(
      "Document de notification pas encore reçu ; retour prévu par mail.",
    );
  }
  if (/\b(pere|papa)\b/.test(f)) {
    const when = day ? frDayLabel(day) : "le jour dit";
    parts.push(
      `Prochaine étape : vérifier avec papa ${when} s'il a reçu quelque chose ; sinon relancer.`,
    );
  } else if (day) {
    parts.push(
      `Prochaine étape : vérifier ${frDayLabel(day)} ; sinon relancer.`,
    );
  }
  return parts.join(" ");
}

/**
 * « je viens d'appeler X, ils n'ont pas le document, je vérifie vendredi
 * avec papa » → suivi, note, jour prévu, et on retire « Appeler » du titre.
 * Filet si le greffier renvoie vide (tour « maj », nom corrigé trop tard).
 */
export function extractCallFollowUpOps(
  threads: Thread[],
  userText: string,
  at = new Date(),
): ThreadOp[] {
  const text = userText.trim();
  if (!text || !looksLikeCallReport(text)) return [];
  if (looksLikeDoneClaim(text) && !callReportNeedsFollowUp(text)) return [];
  if (!callReportNeedsFollowUp(text)) return [];

  const target = uniqueThreadFromAnchor(threads, text);
  if (!target || isContainerThread(target)) return [];

  const day = parseTargetDay(text, at);
  const ops: ThreadOp[] = [];
  const renamed = suiviTitleFromCall(target.text);
  if (renamed) {
    ops.push({ op: "rename", id: target.id, text: renamed });
  }
  const setOp: ThreadOp = { op: "set", id: target.id, kind: "suivi" };
  if (day) setOp.plannedFor = `${day}T12:00:00.000Z`;
  ops.push(setOp);
  ops.push({
    op: "note",
    id: target.id,
    note: buildCallFollowUpNote(text, at, day),
  });
  return ops;
}

export function mergeTurnWrites(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  greffierUpdates: unknown[],
  at = new Date(),
): unknown[] {
  const blob = writeSourceForTurn(messages);
  const scoped = stampWhenOnAdds(
    messages,
    scopeGreffierUpdates(threads, messages, greffierUpdates),
    at,
  );
  const inferredDone = inferConfirmedDoneOps(threads, messages);
  const inferredDelete = inferConfirmedDeleteOps(threads, messages);
  const ours = [
    ...extractRelanceTurnOps(threads, blob, at),
    ...extractCallFollowUpOps(threads, blob, at),
  ];
  let merged = scoped;
  for (const op of inferredDone) {
    if (op.op !== "done") continue;
    const already = merged.some(
      (raw) =>
        typeof raw === "object" &&
        raw !== null &&
        (raw as { op?: string; id?: string }).op === "done" &&
        (raw as { id?: string }).id === op.id,
    );
    if (!already) merged = [...merged, op];
  }
  for (const op of inferredDelete) {
    if (op.op !== "delete") continue;
    const already = merged.some(
      (raw) =>
        typeof raw === "object" &&
        raw !== null &&
        (raw as { op?: string; id?: string }).op === "delete" &&
        (raw as { id?: string }).id === op.id,
    );
    if (!already) merged = [...merged, op];
    merged = merged.filter((raw) => {
      if (typeof raw !== "object" || raw === null) return true;
      const item = raw as { op?: string; id?: string };
      return !(item.op === "done" && item.id === op.id);
    });
  }
  if (ours.length === 0) return merged;

  const targetIds = new Set(
    ours
      .map((o) => ("id" in o && typeof o.id === "string" ? o.id : ""))
      .filter(Boolean),
  );
  const filtered = merged.filter((raw) => {
    if (typeof raw !== "object" || raw === null) return true;
    const item = raw as Record<string, unknown>;
    if (item.op === "done" && typeof item.id === "string" && targetIds.has(item.id)) {
      return false;
    }
    return true;
  });
  return [...filtered, ...ours];
}
