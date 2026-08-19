/** Dernière question — à afficher à part. Le reste reste un seul paragraphe. */

export function splitChatQuestion(text: string): {
  body: string;
  point: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", point: null };

  const chunks = trimmed.split(/(?<=[.!?])\s+/);
  const last = chunks[chunks.length - 1]?.trim() ?? "";
  if (!last.endsWith("?")) return { body: trimmed, point: null };

  const body = chunks.slice(0, -1).join(" ").trim();
  return { body, point: last };
}
