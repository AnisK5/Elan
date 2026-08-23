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

const GENERIC = new Set([
  "avancer",
  "attendre",
  "aller",
  "chercher",
  "commencer",
  "donner",
  "garder",
  "laisser",
  "mettre",
  "ouvrir",
  "parler",
  "passer",
  "penser",
  "porter",
  "pouvoir",
  "prendre",
  "proposer",
  "regarder",
  "rester",
  "savoir",
  "trouver",
  "venir",
  "voir",
  "vouloir",
]);

const ELISION = /^(l|d|n|s|j|c|m|t|qu)'/i;

type Span = { start: number; end: number };
export type TextRun = { text: string; strong: boolean };

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
    .filter((w) => w.length >= MIN && !STOP.has(fold(w)) && !GENERIC.has(fold(w)));
}

function indexOfPrefixWord(
  text: string,
  stem: string,
  from: number,
): { start: number; end: number } | null {
  const hay = text.toLowerCase();
  const needle = stem.toLowerCase();
  if (needle.length < MIN) return null;
  let pos = Math.max(0, from);
  while (pos <= hay.length - needle.length) {
    const i = hay.indexOf(needle, pos);
    if (i === -1) return null;
    if (!isLetter(hay[i - 1])) {
      let end = i + needle.length;
      while (end < hay.length && isLetter(hay[end])) end++;
      if (end - i >= MIN) return { start: i, end };
    }
    pos = i + 1;
  }
  return null;
}

/** Occurrences distinctes des mots du libellé — sans coller le texte entre deux. */
function fuzzyTokenSpans(text: string, label: string): Span[] {
  const tokens = significantTokens(label);
  if (tokens.length === 0) return [];
  const hits: Span[] = [];
  let from = 0;
  for (const tok of tokens) {
    const exact = indexOfTruc(text, tok, from);
    if (exact !== -1) {
      hits.push({ start: exact, end: exact + tok.length });
      from = exact + tok.length;
      continue;
    }
    if (tok.length >= 6) {
      const pre = indexOfPrefixWord(text, tok.slice(0, -2), from);
      if (pre) {
        hits.push(pre);
        from = pre.end;
      }
    }
  }
  return hits;
}

/** Libellés à chercher : trucs ouverts, réguliers, et ceux déjà réglés. */
export function trucLabels(threads: Thread[]): string[] {
  const labels: string[] = [];
  for (const t of threads) {
    if (t.status === "snoozed") continue;
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

function fuzzyTrucSpan(
  text: string,
  label: string,
): { start: number; match: string } | null {
  const hits = fuzzyTokenSpans(text, label);
  if (hits.length === 0) return null;
  if (hits.length === 1) {
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

function markdownSpans(text: string): { inner: string; start: number; end: number }[] {
  const hits: { inner: string; start: number; end: number }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ inner: m[1], start: m.index, end: m.index + m[0].length });
  }
  return hits;
}

/** Un libellé entier, mot à mot — jamais un mot isolé d'un titre plus long. */
function labelSpans(text: string, labels: string[]): Span[] {
  const hits: Span[] = [];
  for (const label of labels) {
    const start = indexOfTruc(text, label);
    if (start !== -1) {
      hits.push({ start, end: start + label.trim().length });
    }
  }
  return hits;
}

/** Le modèle **saupoudre** : on ne garde que les vrais noms de trucs, ou une phrase. */
function keepMarkdown(inner: string, labels: string[]): boolean {
  const t = inner.trim();
  if (!t) return false;
  if (labels.some((l) => indexOfTruc(t, l) === 0 && t.length === l.trim().length)) {
    return true;
  }
  return t.split(/\s+/).filter(Boolean).length >= 3 && t.length >= 16;
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const out: Span[] = [];
  for (const s of sorted) {
    if (out.some((o) => s.start < o.end && s.end > o.start)) continue;
    out.push(s);
  }
  return out.sort((a, b) => a.start - b.start);
}

function runsFromSpans(text: string, spans: Span[]): TextRun[] {
  if (spans.length === 0) return text ? [{ text, strong: false }] : [];
  const runs: TextRun[] = [];
  let last = 0;
  for (const s of spans) {
    if (s.start > last) runs.push({ text: text.slice(last, s.start), strong: false });
    runs.push({ text: text.slice(s.start, s.end), strong: true });
    last = s.end;
  }
  if (last < text.length) runs.push({ text: text.slice(last), strong: false });
  return runs.filter((r) => r.text);
}

/** Gras visible : **markdown** et les mots des trucs, pas les majuscules au hasard. */
export function speechRuns(text: string, labels: string[] = []): TextRun[] {
  const md = markdownSpans(text);
  if (md.length === 0) {
    return runsFromSpans(text, mergeSpans(labelSpans(text, labels)));
  }

  const runs: TextRun[] = [];
  let last = 0;
  for (const hit of md) {
    if (hit.start > last) {
      runs.push(
        ...runsFromSpans(
          text.slice(last, hit.start),
          mergeSpans(labelSpans(text.slice(last, hit.start), labels)),
        ),
      );
    }
    if (keepMarkdown(hit.inner, labels)) {
      runs.push({ text: hit.inner, strong: true });
    } else {
      runs.push({ text: hit.inner, strong: false });
    }
    last = hit.end;
  }
  if (last < text.length) {
    runs.push(
      ...runsFromSpans(
        text.slice(last),
        mergeSpans(labelSpans(text.slice(last), labels)),
      ),
    );
  }
  return runs.filter((r) => r.text);
}
