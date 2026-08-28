import type { ChatMessage } from "./types";

/** Limite l'historique envoyé au modèle — garde la fin de la séance. */
export function trimSessionMessages(
  messages: ChatMessage[],
  maxMessages = 16,
): ChatMessage[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}
