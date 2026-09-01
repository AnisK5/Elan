/** Config app modifiable depuis l'admin — repli sur les variables d'env. */

import { formatSharedTokenLimitWithEur } from "./token-display";
import { getSupabaseAdmin } from "./supabase-admin";

export const SHARED_TOKEN_LIMIT_CONFIG_KEY = "shared_daily_token_limit";
export const DEFAULT_SHARED_DAILY_TOKEN_LIMIT = 120_000;
export const UNLIMITED_SHARED_DAILY_TOKEN_LIMIT = 0;
export const MIN_SHARED_DAILY_TOKEN_LIMIT = 10_000;
export const MAX_SHARED_DAILY_TOKEN_LIMIT = 1_000_000;

const CACHE_MS = 30_000;

let cachedLimit: { value: number; at: number } | null = null;

export function envSharedDailyTokenLimit(): number {
  const raw = process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
  if (!raw) return DEFAULT_SHARED_DAILY_TOKEN_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_SHARED_DAILY_TOKEN_LIMIT;
  if (isUnlimitedSharedTokenLimit(n)) return UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
  return n > 0 ? n : DEFAULT_SHARED_DAILY_TOKEN_LIMIT;
}

/** @deprecated Préférer resolveSharedDailyTokenLimit — sync, env seulement. */
export function sharedDailyTokenLimit(): number {
  return envSharedDailyTokenLimit();
}

export function isUnlimitedSharedTokenLimit(limit: number): boolean {
  return limit === UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
}

export function formatSharedTokenLimit(limit: number): string {
  return formatSharedTokenLimitWithEur(limit);
}

export function parseSharedTokenLimitInput(value: unknown): number | null {
  if (
    value === UNLIMITED_SHARED_DAILY_TOKEN_LIMIT ||
    value === "unlimited" ||
    value === "none"
  ) {
    return UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
  }
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (isUnlimitedSharedTokenLimit(rounded)) {
    return UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
  }
  if (rounded < MIN_SHARED_DAILY_TOKEN_LIMIT) return null;
  if (rounded > MAX_SHARED_DAILY_TOKEN_LIMIT) return null;
  return rounded;
}

function parseStoredLimit(value: unknown): number | null {
  if (value && typeof value === "object") {
    if (
      "unlimited" in value &&
      (value as { unlimited?: unknown }).unlimited === true
    ) {
      return UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
    }
    if ("limit" in value) {
      const limit = (value as { limit: unknown }).limit;
      if (limit === null) return UNLIMITED_SHARED_DAILY_TOKEN_LIMIT;
      return parseSharedTokenLimitInput(limit);
    }
  }
  if (typeof value === "number") return parseSharedTokenLimitInput(value);
  return null;
}

export function invalidateSharedTokenLimitCache(): void {
  cachedLimit = null;
}

export async function resolveSharedDailyTokenLimit(): Promise<number> {
  const envLimit = envSharedDailyTokenLimit();
  if (cachedLimit && Date.now() - cachedLimit.at < CACHE_MS) {
    return cachedLimit.value;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return envLimit;

  try {
    const { data, error } = await admin
      .from("elan_app_config")
      .select("value")
      .eq("key", SHARED_TOKEN_LIMIT_CONFIG_KEY)
      .maybeSingle();

    if (error) return envLimit;

    const stored = parseStoredLimit(
      (data as { value?: unknown } | null)?.value,
    );
    const limit = stored ?? envLimit;
    cachedLimit = { value: limit, at: Date.now() };
    return limit;
  } catch {
    return envLimit;
  }
}

export async function readSharedDailyTokenLimitConfig(): Promise<{
  limit: number;
  source: "db" | "env";
  envDefault: number;
}> {
  const envDefault = envSharedDailyTokenLimit();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { limit: envDefault, source: "env", envDefault };
  }

  try {
    const { data, error } = await admin
      .from("elan_app_config")
      .select("value")
      .eq("key", SHARED_TOKEN_LIMIT_CONFIG_KEY)
      .maybeSingle();

    if (error) {
      return { limit: envDefault, source: "env", envDefault };
    }

    const stored = parseStoredLimit(
      (data as { value?: unknown } | null)?.value,
    );
    if (stored == null) {
      return { limit: envDefault, source: "env", envDefault };
    }
    return { limit: stored, source: "db", envDefault };
  } catch {
    return { limit: envDefault, source: "env", envDefault };
  }
}

export async function writeSharedDailyTokenLimit(limit: number): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("supabase-admin-not-configured");

  const parsed = parseSharedTokenLimitInput(limit);
  if (parsed == null) throw new Error("invalid-limit");

  const value = isUnlimitedSharedTokenLimit(parsed)
    ? { unlimited: true }
    : { limit: parsed };

  const { error } = await admin.from("elan_app_config").upsert({
    key: SHARED_TOKEN_LIMIT_CONFIG_KEY,
    value,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  invalidateSharedTokenLimitCache();
}
