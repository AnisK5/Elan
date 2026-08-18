/** Dernière question d'un message — à afficher à part, plus visible. */

export function splitChatQuestion(text: string): {
  body: string;
  question: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", question: null };

  const chunks = trimmed.split(/(?<=[.!?])\s+/);
  const last = chunks[chunks.length - 1]?.trim() ?? "";
  if (!last.endsWith("?")) return { body: trimmed, question: null };

  const body = chunks.slice(0, -1).join(" ").trim();
  return { body, question: last };
}
