import type { Thread } from "@/lib/types";
import { isContainerThread, parseReguliers } from "@/lib/entretiens";

const MIN = 4;

function isLetter(ch: string | undefined): boolean {
  return !!ch && /\p{L}/u.test(ch);
}

/** Index du libellé dans le texte, borné aux mots (accents compris). */
export function indexOfTruc(text: string, label: string): number {
  const hay = text.toLowerCase();
  const needle = label.trim().toLowerCase();
  if (needle.length < MIN) return -1;
  let from = 0;
  while (from <= hay.length - needle.length) {
    const i = hay.indexOf(needle, from);
    if (i === -1) return -1;
    const before = !isLetter(hay[i - 1]);
    const after = !isLetter(hay[i + needle.length]);
    if (before && after) return i;
    from = i + 1;
  }
  return -1;
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
    if (start === -1) continue;
    const match = text.slice(start, start + label.trim().length);
    if (!best || match.length > best.match.length) best = { start, match };
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
  const hit = splitAroundTruc(text, labels);
  if (!hit) return text ? [{ text, strong: false }] : [];
  return [
    { text: hit.before, strong: false },
    { text: hit.match, strong: true },
    { text: hit.after, strong: false },
  ].filter((r) => r.text);
}
