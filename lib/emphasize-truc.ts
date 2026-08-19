import type { Thread } from "@/lib/types";
import { isContainerThread, parseReguliers } from "@/lib/entretiens";

const MIN = 4;

const STOP = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "et",
  "ou",
  "ni",
  "au",
  "aux",
  "en",
  "ce",
  "cet",
  "cette",
  "ces",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "tes",
  "son",
  "sa",
  "ses",
  "notre",
  "nos",
  "votre",
  "vos",
  "leur",
  "leurs",
  "que",
  "qui",
  "dont",
  "pas",
  "plus",
  "jamais",
  "pour",
  "par",
  "sur",
  "dans",
  "avec",
  "sans",
  "sous",
  "chez",
  "vers",
  "entre",
  "apres",
  "avant",
  "depuis",
  "pendant",
  "comme",
  "mais",
  "donc",
  "car",
  "bien",
  "tout",
  "toute",
  "tous",
  "toutes",
  "tres",
  "fait",
  "faire",
  "truc",
  "min",
  "minute",
  "minutes",
  "creneau",
  "seance",
]);

const ELISION = /^(l|d|n|s|j|c|m|t|qu)'/i;

function isLetter(ch: string | undefined): boolean {
  return !!ch && /\p{L}/u.test(ch);
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Index du libellé dans le texte, borné aux mots (accents compris). */
export function indexOfTruc(text: string, label: string, from = 0): number {
  const hay = text.toLowerCase();
  const needle = label.trim().toLowerCase();
  if (needle.length < MIN) return -1;
  let pos = Math.max(0, from);
  while (pos <= hay.length - needle.length) {
    const i = hay.indexOf(needle, pos);
    if (i === -1) return -1;
    const before = !isLetter(hay[i - 1]);
    const after = !isLetter(hay[i + needle.length]);
    if (before && after) return i;
    pos = i + 1;
  }
  return -1;
}

function significantTokens(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .map((w) => w.replace(ELISION, "").replace(/'/g, ""))
    .filter((w) => w.length >= MIN && !STOP.has(fold(w)));
}

function fuzzyTrucSpan(
  text: string,
  label: string,
): { start: number; match: string } | null {
  const tokens = significantTokens(label);
  if (tokens.length === 0) return null;
  const hits: { start: number; end: number }[] = [];
  let from = 0;
  for (const tok of tokens) {
    const i = indexOfTruc(text, tok, from);
    if (i === -1) continue;
    hits.push({ start: i, end: i + tok.length });
    from = i + tok.length;
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) {
    if (tokens.length > 1 && hits[0].end - hits[0].start < 6) return null;
    return {
      start: hits[0].start,
      match: text.slice(hits[0].start, hits[0].end),
    };
  }
  const start = hits[0].start;
  const end = hits[hits.length - 1].end;
  if (end - start > 90) {
    const longest = hits.reduce((a, b) =>
      b.end - b.start > a.end - a.start ? b : a,
    );
    return {
      start: longest.start,
      match: text.slice(longest.start, longest.end),
    };
  }
  return { start, match: text.slice(start, end) };
}

/** Libellés à chercher : trucs ouverts + réguliers retenus. */
export function trucLabels(threads: Thread[]): string[] {
  const labels: string[] = [];
  for (const t of threads) {
    if (t.status !== "open") continue;
    if (isContainerThread(t)) {
      for (const item of parseReguliers(t.note)) {
        const label = item.label.trim();
        if (label.length >= MIN) labels.push(label);
      }
      continue;
    }
    const text = t.text.trim();
    if (text.length >= MIN) labels.push(text);
  }
  return labels;
}

/** Le plus long libellé présent dans le texte — un seul. */
export function findTrucInText(
  text: string,
  labels: string[],
): { start: number; match: string } | null {
  let best: { start: number; match: string } | null = null;
  for (const label of labels) {
    const start = indexOfTruc(text, label);
    const exact =
      start === -1
        ? null
        : { start, match: text.slice(start, start + label.trim().length) };
    const fuzzy = exact ? null : fuzzyTrucSpan(text, label);
    const hit = exact ?? fuzzy;
    if (!hit) continue;
    if (!best || hit.match.length > best.match.length) best = hit;
  }
  return best;
}

export function splitAroundTruc(
  text: string,
  labels: string[],
): { before: string; match: string; after: string } | null {
  const hit = findTrucInText(text, labels);
  if (!hit) return null;
  return {
    before: text.slice(0, hit.start),
    match: hit.match,
    after: text.slice(hit.start + hit.match.length),
  };
}

function properNamesInText(text: string): string[] {
  const names: string[] = [];
  const re = /(?<=\s)([A-ZÉÈÊÀÂÎÏÔÙÛÇ][\p{L}'’-]{3,})\b/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1];
    if (STOP.has(fold(n))) continue;
    names.push(n);
  }
  return names;
}

export type TextRun = { text: string; strong: boolean };

/** Gras visible : d'abord **markdown**, sinon le nom du truc. */
export function speechRuns(text: string, labels: string[] = []): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let foundMd = false;
  while ((m = re.exec(text)) !== null) {
    foundMd = true;
    if (m.index > last) runs.push({ text: text.slice(last, m.index), strong: false });
    runs.push({ text: m[1], strong: true });
    last = m.index + m[0].length;
  }
  if (foundMd) {
    if (last < text.length) runs.push({ text: text.slice(last), strong: false });
    return runs.filter((r) => r.text);
  }
  const hit = splitAroundTruc(text, [...labels, ...properNamesInText(text)]);
  if (!hit) return text ? [{ text, strong: false }] : [];
  return [
    { text: hit.before, strong: false },
    { text: hit.match, strong: true },
    { text: hit.after, strong: false },
  ].filter((r) => r.text);
}
