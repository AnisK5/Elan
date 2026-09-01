import type { AnthropicFailKind } from "./anthropic";
import { markAiDegraded } from "./ai-degraded-client";
import { aiUserFailCopy, BYOK_HINT, LIST_HINT } from "./ai-user-messages";

export function reportAiFail(kind: AnthropicFailKind | null | undefined): void {
  if (kind === "credits" || kind === "quota") markAiDegraded(kind);
}

export function aiRetryHint(kind: AnthropicFailKind | null | undefined): string | undefined {
  if (!kind) return undefined;
  const copy = aiUserFailCopy(kind);
  const parts: string[] = [];
  if (copy.showListHint) parts.push(LIST_HINT);
  if (copy.showByokHint) parts.push(BYOK_HINT);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
