import type { AnthropicFailKind } from "./anthropic";
import {
  clearAiDegraded,
  markAiDegraded,
  readAiDegraded,
} from "./ai-degraded-client";
import { aiUserFailCopy, BYOK_HINT, LIST_HINT } from "./ai-user-messages";

export function reportAiFail(kind: AnthropicFailKind | null | undefined): void {
  if (kind === "credits" || kind === "quota" || kind === "no_key") {
    markAiDegraded(kind);
  }
}

/** IA de nouveau dispo — enlève le bandeau « pause » pour la visite. */
export function reportAiRecovered(opts?: { refreshPlan?: boolean }): void {
  if (typeof window === "undefined") return;
  const wasDegraded = Boolean(readAiDegraded());
  clearAiDegraded();
  window.dispatchEvent(
    new CustomEvent("elan:ai-recovered", {
      detail: { refreshPlan: opts?.refreshPlan ?? wasDegraded },
    }),
  );
}

export function aiRetryHint(kind: AnthropicFailKind | null | undefined): string | undefined {
  if (!kind) return undefined;
  const copy = aiUserFailCopy(kind);
  const parts: string[] = [];
  if (copy.showListHint) parts.push(LIST_HINT);
  if (copy.showByokHint) parts.push(BYOK_HINT);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
