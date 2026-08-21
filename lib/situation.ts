import type { ChatMessage } from "@/lib/types";

export interface Situation {
  text: string;
  until?: string;
}

const AWAY_PLACE =
  /\b(vienne|pas chez moi|pas à la maison|pas sur place)\b/i;

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveYear(month: number, day: number, at: Date): number {
  const today = startOfDay(at);
  let y = today.getFullYear();
  const candidate = new Date(y, month - 1, day);
  candidate.setHours(0, 0, 0, 0);
  if (candidate.getTime() < today.getTime() - 40 * 86_400_000) y += 1;
  return y;
}

function daysFrom(iso: string, at: Date): number {
  const today = startOfDay(at);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

export function formatUntilFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Date de retour la plus tardive (« 27 ou 28 août » → 28). */
export function parseReturnDate(blob: string, at = new Date()): string | null {
  const dates: Date[] = [];

  const range = blob.matchAll(
    /(\d{1,2})\s+ou\s+(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|aout|septembre|octobre|novembre|d[eé]cembre)/gi,
  );
  for (const m of range) {
    const month = FR_MONTHS[m[3].toLowerCase()];
    if (!month) continue;
    const d1 = Number(m[1]);
    const d2 = Number(m[2]);
    const y = resolveYear(month, Math.max(d1, d2), at);
    const a = new Date(y, month - 1, d1);
    const b = new Date(y, month - 1, d2);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    dates.push(laterOf(a, b));
  }

  const named = blob.matchAll(
    /(?:le\s+|jusqu['’]au\s+)?(\d{1,2}|1er)\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|aout|septembre|octobre|novembre|d[eé]cembre)(?:\s+(\d{4}))?/gi,
  );
  for (const m of named) {
    const day = m[1].toLowerCase() === "1er" ? 1 : Number(m[1]);
    const month = FR_MONTHS[m[2].toLowerCase()];
    if (!month || day < 1 || day > 31) continue;
    const y = m[3] ? Number(m[3]) : resolveYear(month, day, at);
    const d = new Date(y, month - 1, day);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }

  const slash = blob.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g);
  for (const m of slash) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    const y = m[3]
      ? Number(m[3]) < 100
        ? 2000 + Number(m[3])
        : Number(m[3])
      : resolveYear(month, day, at);
    const d = new Date(y, month - 1, day);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }

  if (dates.length === 0) return null;
  const latest = dates.reduce((acc, d) => laterOf(acc, d));
  if (daysFrom(isoDay(latest), at) <= 0) return null;
  return isoDay(latest);
}

function placeHint(blob: string): string {
  if (/\bvienne\b/i.test(blob)) return "À Vienne, pas chez soi";
  if (AWAY_PLACE.test(blob)) return "Pas chez soi";
  return "";
}

/** Ce qu'elle vient de dire sur SA vie — pas un truc, un cadre. */
export function extractSituationFromConvo(
  messages: Pick<ChatMessage, "role" | "content">[],
  at = new Date(),
): Situation | null {
  const recent = messages.slice(-16);
  if (recent.length === 0) return null;
  const blob = recent.map((m) => m.content).join("\n");
  const place = placeHint(blob);
  if (!place) return null;
  const until = parseReturnDate(blob, at);
  const text = until
    ? `${place}. Retour le ${formatUntilFr(until)}.`
    : `${place}.`;
  return { text, until: until ?? undefined };
}

/** Une fois la date de retour passée, ce n'est plus vrai. */
export function activeSituation(
  s: Situation | null | undefined,
  at = new Date(),
): Situation | null {
  if (!s?.text.trim()) return null;
  if (s.until) {
    const y = s.until.slice(0, 10);
    if (y && daysFrom(y, at) < 0) return null;
  }
  return { text: s.text.trim(), until: s.until };
}

export function mergeSituation(
  current: Situation | null,
  incoming: Situation | null,
): Situation | null {
  if (!incoming) return activeSituation(current);
  const next: Situation = {
    text: incoming.text.trim() || current?.text || "",
    until: incoming.until ?? current?.until,
  };
  return activeSituation(next);
}
