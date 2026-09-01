/** Clé perso : repli sur celle de l'app si elle ne répond plus. */

const FALLBACK_KEY = "elan.byok-fallback.v1";
const NOTICE_KEY = "elan.byok-notice.v1";

export function markByokFallbackActive(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(FALLBACK_KEY, "1");
  sessionStorage.setItem(NOTICE_KEY, "1");
  window.dispatchEvent(new CustomEvent("elan:byok-fallback"));
}

export function clearByokFallback(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(FALLBACK_KEY);
  sessionStorage.removeItem(NOTICE_KEY);
  window.dispatchEvent(new CustomEvent("elan:byok-fallback"));
}

export function shouldOmitUserAnthropicKey(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(FALLBACK_KEY) === "1";
}

export function readByokFallbackNotice(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(NOTICE_KEY) === "1";
}

export function dismissByokFallbackNotice(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(NOTICE_KEY);
  window.dispatchEvent(new CustomEvent("elan:byok-fallback"));
}
