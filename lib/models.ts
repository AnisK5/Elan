/** Modèles Claude utilisés par Élan — Sonnet par défaut, Opus en opt-in. */

export const CLAUDE_SONNET = "claude-sonnet-4-6";
export const CLAUDE_OPUS = "claude-opus-4-8";
export const CLAUDE_HAIKU = "claude-haiku-4-5";

/** Préférence utilisateur : léger = Sonnet partout (défaut) ; présent = Opus en séance. */
export type ModelPreference = "present" | "light";

export const DEFAULT_MODEL_PREFERENCE: ModelPreference = "light";

export const MODEL_PREF_HEADER = "x-elan-model-pref";
const STORAGE_KEY = "elan.model-pref.v2";
const LEGACY_STORAGE_KEY = "elan.model-pref.v1";

interface StoredModelPreference {
  pref?: string;
  /** true seulement si la personne a choisi dans Réglages. */
  explicit?: boolean;
}

export function isModelPreference(v: unknown): v is ModelPreference {
  return v === "present" || v === "light";
}

function parseStored(raw: string | null): StoredModelPreference | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredModelPreference;
  } catch {
    return null;
  }
}

function persistModelPreference(
  pref: ModelPreference,
  explicit: boolean,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ pref, explicit }),
  );
}

/** v1 gardait Opus par défaut sans marquer un choix explicite — on bascule tout le monde en léger. */
function migrateLegacyModelPreference(stored: StoredModelPreference): ModelPreference {
  if (stored.pref === "light") return "light";
  return DEFAULT_MODEL_PREFERENCE;
}

export function readModelPreference(): ModelPreference {
  if (typeof window === "undefined") return DEFAULT_MODEL_PREFERENCE;
  try {
    const current = parseStored(window.localStorage.getItem(STORAGE_KEY));
    if (current && isModelPreference(current.pref)) {
      if (current.pref === "present" && current.explicit !== true) {
        persistModelPreference(DEFAULT_MODEL_PREFERENCE, false);
        return DEFAULT_MODEL_PREFERENCE;
      }
      return current.pref;
    }

    const legacy = parseStored(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) {
      const migrated = migrateLegacyModelPreference(legacy);
      const explicit = legacy.pref === "light";
      persistModelPreference(migrated, explicit);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return DEFAULT_MODEL_PREFERENCE;
  } catch {
    return DEFAULT_MODEL_PREFERENCE;
  }
}

export function writeModelPreference(pref: ModelPreference): void {
  persistModelPreference(pref, true);
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
