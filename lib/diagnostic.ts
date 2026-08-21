/** Diagnostic local — cet appareil seulement, jamais sync / jamais notif. */

const KEY = "elan.diagnostic.v1";

export function isDiagnosticEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDiagnosticEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
