/** Modèles Claude utilisés par Élan — Sonnet par défaut, Opus en opt-in. */

export const CLAUDE_SONNET = "claude-sonnet-4-6";
export const CLAUDE_OPUS = "claude-opus-4-8";
export const CLAUDE_HAIKU = "claude-haiku-4-5";

/** Préférence utilisateur : léger = Sonnet partout (défaut) ; présent = Opus en séance. */
export type ModelPreference = "present" | "light";

export const DEFAULT_MODEL_PREFERENCE: ModelPreference = "light";

export const MODEL_PREF_HEADER = "x-elan-model-pref";
const STORAGE_KEY = "elan.model-pref.v1";

export function isModelPreference(v: unknown): v is ModelPreference {
  return v === "present" || v === "light";
}

export function readModelPreference(): ModelPreference {
  if (typeof window === "undefined") return DEFAULT_MODEL_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_PREFERENCE;
    const j = JSON.parse(raw) as { pref?: string };
    return isModelPreference(j.pref) ? j.pref : DEFAULT_MODEL_PREFERENCE;
  } catch {
    return DEFAULT_MODEL_PREFERENCE;
  }
}

export function writeModelPreference(pref: ModelPreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ pref }));
}

export function resolveModelPreference(req?: Request): ModelPreference {
  const fromHeader = req?.headers.get(MODEL_PREF_HEADER)?.trim() ?? "";
  if (isModelPreference(fromHeader)) return fromHeader;
  return DEFAULT_MODEL_PREFERENCE;
}

/**
 * Chat → Sonnet. Séance → Sonnet par défaut, Opus si « plus présent ».
 */
export function resolveConversationModel(
  surface: "chat" | "session",
  pref: ModelPreference = DEFAULT_MODEL_PREFERENCE,
): string {
  if (surface === "chat") return CLAUDE_SONNET;
  return pref === "light" ? CLAUDE_SONNET : CLAUDE_OPUS;
}

/** Greffier, tidy, plan court — Haiku suffit et coûte ~10× moins. */
export function resolveUtilityModel(): string {
  return CLAUDE_HAIKU;
}
