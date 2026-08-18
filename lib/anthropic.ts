/** Clé Claude : celle de la personne si elle en a une, sinon celle de l'app. */

export const ANTHROPIC_KEY_HEADER = "x-elan-anthropic-key";
const STORAGE_KEY = "elan.anthropic.v1";

export function looksLikeAnthropicKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

/** Serveur : header perso si valide, sinon ANTHROPIC_API_KEY. */
export function resolveAnthropicKey(req?: Request): string | null {
  const fromUser = req?.headers.get(ANTHROPIC_KEY_HEADER)?.trim() ?? "";
  if (looksLikeAnthropicKey(fromUser)) return fromUser;
  const env = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return env || null;
}

export function readUserAnthropicKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const j = JSON.parse(raw) as { key?: string };
    return typeof j.key === "string" ? j.key.trim() : "";
  } catch {
    return "";
  }
}

export function writeUserAnthropicKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: trimmed }));
}

/** fetch vers /api/* avec la clé perso si elle est là. */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const key = readUserAnthropicKey();
  if (looksLikeAnthropicKey(key)) {
    headers.set(ANTHROPIC_KEY_HEADER, key);
  }
  return fetch(input, { ...init, headers });
}
