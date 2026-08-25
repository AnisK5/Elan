/** Modèles Claude utilisés par Élan — chat léger, séance présente. */

export const CLAUDE_SONNET = "claude-sonnet-4-6";
export const CLAUDE_OPUS = "claude-opus-4-8";

/** Préférence utilisateur : présent = Opus en séance ; léger = Sonnet partout. */
export type ModelPreference = "present" | "light";

export const MODEL_PREF_HEADER = "x-elan-model-pref";
const STORAGE_KEY = "elan.model-pref.v1";

export function isModelPreference(v: unknown): v is ModelPreference {
  return v === "present" || v === "light";
}

export function readModelPreference(): ModelPreference {
  if (typeof window === "undefined") return "present";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "present";
    const j = JSON.parse(raw) as { pref?: string };
    return isModelPreference(j.pref) ? j.pref : "present";
  } catch {
    return "present";
  }
}

export function writeModelPreference(pref: ModelPreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ pref }));
}

export function resolveModelPreference(req?: Request): ModelPreference {
  const fromHeader = req?.headers.get(MODEL_PREF_HEADER)?.trim() ?? "";
  if (isModelPreference(fromHeader)) return fromHeader;
  return "present";
}

/**
 * Chat → Sonnet (coût). Séance → Opus sauf préférence « léger ».
 */
export function resolveConversationModel(
  surface: "chat" | "session",
  pref: ModelPreference = "present",
): string {
  if (surface === "chat") return CLAUDE_SONNET;
  return pref === "light" ? CLAUDE_SONNET : CLAUDE_OPUS;
}
