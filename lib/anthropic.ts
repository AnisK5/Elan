/** Clé Claude : celle de la personne si elle en a une, sinon celle de l'app. */

import { aiUserFailMessage } from "@/lib/ai-user-messages";
import { MODEL_PREF_HEADER, readModelPreference } from "@/lib/models";

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

export type AnthropicFailKind =
  | "credits"
  | "quota"
  | "auth"
  | "rate"
  | "unknown";

const STREAM_ERROR_RE = /⟦elan-error:(credits|quota|auth|rate|unknown)⟧/;

export function classifyAnthropicError(err: unknown): AnthropicFailKind {
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err ?? "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("credit balance is too low") ||
    lower.includes("too low to access the anthropic api") ||
    lower.includes("purchase credits")
  ) {
    return "credits";
  }
  if (
    lower.includes("invalid api key") ||
    lower.includes("authentication_error") ||
    lower.includes("invalid x-api-key")
  ) {
    return "auth";
  }
  if (
    lower.includes("rate_limit") ||
    lower.includes("overloaded") ||
    lower.includes("429")
  ) {
    return "rate";
  }
  return "unknown";
}

export function anthropicFailMessage(kind: AnthropicFailKind): string {
  return aiUserFailMessage(kind);
}

/** Marqueur flux quand le plafond journalier partagé est atteint. */
export function encodeQuotaError(): string {
  return "⟦elan-error:quota⟧";
}

/** Marqueur dans le flux texte — jamais affiché tel quel. */
export function encodeStreamError(err: unknown): string {
  return `⟦elan-error:${classifyAnthropicError(err)}⟧`;
}

export function parseStreamError(text: string): {
  clean: string;
  kind: AnthropicFailKind | null;
} {
  const m = STREAM_ERROR_RE.exec(text);
  if (!m) return { clean: text, kind: null };
  return {
    clean: text
      .replace(/\s*⟦elan-error:(credits|quota|auth|rate|unknown)⟧\s*/g, "")
      .trim(),
    kind: m[1] as AnthropicFailKind,
  };
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

/** fetch vers /api/* avec la clé perso, la préférence de modèle et l'auth Supabase. */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const key = readUserAnthropicKey();
  if (looksLikeAnthropicKey(key)) {
    headers.set(ANTHROPIC_KEY_HEADER, key);
  }
  headers.set(MODEL_PREF_HEADER, readModelPreference());
  try {
    const { getSupabase } = await import("./supabase");
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.auth.getSession();
      if (data.session?.access_token) {
        headers.set("Authorization", `Bearer ${data.session.access_token}`);
      }
    }
  } catch {
    // pas de session — appel anonyme OK
  }
  return fetch(input, { ...init, headers });
}
