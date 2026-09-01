/** État « IA en pause » pour la visite en cours (bandeau global). */

const KEY = "elan.ai-degraded.v1";

export type AiDegradedKind = "credits" | "quota";

export function markAiDegraded(kind: AiDegradedKind): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY, kind);
  window.dispatchEvent(new CustomEvent("elan:ai-degraded"));
}

export function readAiDegraded(): AiDegradedKind | null {
  if (typeof sessionStorage === "undefined") return null;
  const v = sessionStorage.getItem(KEY);
  return v === "credits" || v === "quota" ? v : null;
}

export function clearAiDegraded(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("elan:ai-degraded"));
}
