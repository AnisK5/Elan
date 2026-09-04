/**
 * Fusion des notes greffier : une pile, pas un journal.
 * Une seule « prochaine étape », pas de doublon, et ce qui est fait
 * écarte l'objectif / l'étape qu'il vient d'accomplir.
 */

import {
  conditionAnsweredInNote,
  stripUnverifiedConditionClause,
} from "./plan-candidates";

const STOP = new Set([
  "avec",
  "dans",
  "pour",
  "plus",
  "puis",
  "les",
  "des",
  "une",
  "avant",
  "apres",
  "quand",
  "cette",
  "lock",
  "prix",
  "etape",
  "etapes",
  "prochaine",
  "prochaines",
  "objectif",
  "initial",
  "initialement",
]);

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(s: string): string[] {
  return fold(s)
    .split(" ")
    .filter((t) => t.length >= 5 && !STOP.has(t));
}

function isNextStep(s: string): boolean {
  return /^prochaines?\s+[ée]tape/i.test(s.trim());
}

function isObjective(s: string): boolean {
  return /^objectif\b/i.test(s.trim());
}

function isDoneFact(s: string): boolean {
  if (isNextStep(s)) return false;
  return /\b(achete|reserve|pris|prise|prises|fait|faite|faites|envoye|bloque|paye|commande)s?\b/.test(
    fold(s),
  );
}

export function splitNoteParts(s: string): string[] {
  if (!s.trim()) return [];
  const chunks = s.split(/\s*·\s*/);
  const out: string[] = [];
  for (const chunk of chunks) {
    const pieces = chunk.split(
      /(?=(?:Prochaines?\s+[ée]tape\s*:|Objectif\b[^:]*:))/i,
    );
    for (const p of pieces) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function isDup(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const [lo, hi] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  if (lo.length >= 24 && hi.includes(lo)) return true;
  const ta = contentTokens(lo);
  if (ta.length === 0) return false;
  const tb = new Set(contentTokens(hi));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.length >= 0.75 && lo.length >= 20;
}

function sharesContent(a: string, b: string): boolean {
  const tb = new Set(contentTokens(b));
  if (tb.size === 0) return false;
  return contentTokens(a).some((t) => tb.has(t));
}

function compactParts(parts: string[]): string[] {
  const done = parts.filter(isDoneFact);
  const lastStep = [...parts].reverse().find(isNextStep);
  const out: string[] = [];
  for (const p of parts) {
    if (isNextStep(p)) continue;
    if (isObjective(p) && done.some((d) => sharesContent(p, d))) continue;
    if (out.some((q) => isDup(q, p))) continue;
    out.push(p);
  }
  if (
    lastStep &&
    !done.some((d) => sharesContent(lastStep, d)) &&
    !out.some((q) => isDup(q, lastStep))
  ) {
    out.push(lastStep);
  }
  return out;
}

function joinParts(parts: string[]): string {
  return parts.join(" · ");
}

/** Fusionne deux notes. `a` / `b` sont déjà nettoyées (clean). */
export function mergeNoteTexts(a: string, b: string): string {
  if (!b) return a;
  if (!a) return joinParts(compactParts(splitNoteParts(b)));

  let left = a;
  if (conditionAnsweredInNote(b)) {
    left = stripUnverifiedConditionClause(left);
    if (!left) return b;
  }

  // Listes structurées (Réguliers = une ligne par habitude) : l'état entier gagne.
  if (b.includes("\n") && b.length >= left.length * 0.6) return b;

  return joinParts(
    compactParts([...splitNoteParts(left), ...splitNoteParts(b)]),
  );
}
