/** Pause IA volontaire — cet appareil seulement (comme le diagnostic). */

const KEY = "elan.ai-enabled.v1";

/** true = IA active (défaut). false = aucun appel Anthropic depuis ce client. */
export function isAiEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAiEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "0");
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent("elan:ai-enabled", { detail: { on } }),
  );
}

const AI_API_PREFIXES = [
  "/api/plan",
  "/api/session",
  "/api/chat",
  "/api/reconcile",
  "/api/tidy",
  "/api/ai/ping",
] as const;

export function isAiApiPath(path: string): boolean {
  try {
    const pathname = path.startsWith("http")
      ? new URL(path).pathname
      : path.split("?")[0] ?? path;
    return AI_API_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  } catch {
    return AI_API_PREFIXES.some((p) => path.includes(p));
  }
}
