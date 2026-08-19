/** Dernière phrase = le point — à afficher à part, plus visible. */

export function splitChatQuestion(text: string): {
  body: string;
  point: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", point: null };

  const chunks = trimmed.split(/(?<=[.!?])\s+/);
  const last = chunks[chunks.length - 1]?.trim() ?? "";
  const body = chunks.slice(0, -1).join(" ").trim();

  if (!body) {
    if (last.endsWith("?")) return { body: "", point: last };
    return { body: trimmed, point: null };
  }

  return { body, point: last };
}
