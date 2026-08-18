/** Dernière question d'un message — à afficher à part, plus visible. */

export function splitChatQuestion(text: string): {
  body: string;
  question: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", question: null };
  if (!/\?\s*$/.test(trimmed)) return { body: trimmed, question: null };

  const m = trimmed.match(/^(.*?[.!…])\s+([^?]*\?)\s*$/);
  if (m) return { body: m[1].trim(), question: m[2].trim() };
  return { body: "", question: trimmed };
}
