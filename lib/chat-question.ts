/** Dernière question — à afficher à part. Le reste reste un seul paragraphe. */

const MAX_NEXT_STEP_WORDS = 12;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function capitalizeFr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Encart : garder seulement la dernière clause si la question est trop longue. */
export function shortenNextStep(q: string): {
  point: string;
  prefix: string | null;
} {
  const t = q.trim();
  if (wordCount(t) <= MAX_NEXT_STEP_WORDS) return { point: t, prefix: null };
  const parts = t.split(/\s*[—–:;]\s+/);
  if (parts.length < 2) return { point: t, prefix: null };
  let last = parts[parts.length - 1].trim();
  if (!last.endsWith("?")) last = last.replace(/[.!…]+\s*$/, "") + "?";
  if (wordCount(last) < 3 || wordCount(last) >= wordCount(t)) {
    return { point: t, prefix: null };
  }
  const prefix = parts.slice(0, -1).join(" — ").trim();
  return { point: capitalizeFr(last), prefix: prefix || null };
}

export function splitChatQuestion(text: string): {
  body: string;
  point: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", point: null };

  const chunks = trimmed.split(/(?<=[.!?])\s+/);
  const last = chunks[chunks.length - 1]?.trim() ?? "";
  if (!last.endsWith("?")) return { body: trimmed, point: null };

  const rest = chunks.slice(0, -1);
  const { point, prefix } = shortenNextStep(last);
  if (prefix) rest.push(prefix.endsWith(".") ? prefix : `${prefix}.`);
  return { body: rest.join(" ").trim(), point };
}
