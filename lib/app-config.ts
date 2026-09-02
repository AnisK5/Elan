/** Config app modifiable depuis l'admin — repli sur les variables d'env. */

import { formatSharedTokenLimitWithEur } from "./token-display";
import { getSupabaseAdmin } from "./supabase-admin";

export const SHARED_TOKEN_LIMIT_CONFIG_KEY = "shared_daily_token_limit";
export const DEFAULT_SHARED_DAILY_TOKEN_LIMIT = 120_000;
export const UNLIMITED_SHARED_DAILY_TOKEN_LIMIT = 0;
export const MIN_SHARED_DAILY_TOKEN_LIMIT = 10_000;
export const MAX_SHARED_DAILY_TOKEN_LIMIT = 1_000_000;

export const PLAN_CALLS_PER_HOUR_CONFIG_KEY = "plan_calls_per_hour";
export const DEFAULT_PLAN_CALLS_PER_HOUR = 10;
/** 0 = plafond désactivé (dangereux — admin seulement). */
export const MIN_PLAN_CALLS_PER_HOUR = 0;
export const MAX_PLAN_CALLS_PER_HOUR = 100;

const CACHE_MS = 30_000;

let cachedLimit: { value: number; at: number } | null = null;
let cachedPlanCallsPerHour: { value: number; at: number } | null = null;

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

export function envPlanCallsPerHour(): number {
  const raw = process.env.ELAN_PLAN_CALLS_PER_HOUR;
  if (!raw) return DEFAULT_PLAN_CALLS_PER_HOUR;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_PLAN_CALLS_PER_HOUR;
  if (n === 0) return 0;
  if (n < 1 || n > MAX_PLAN_CALLS_PER_HOUR) return DEFAULT_PLAN_CALLS_PER_HOUR;
  return n;
}

export function parsePlanCallsPerHourInput(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded === 0) return 0;
  if (rounded < 1 || rounded > MAX_PLAN_CALLS_PER_HOUR) return null;
  return rounded;
}

function parseStoredPlanCallsPerHour(value: unknown): number | null {
  if (value && typeof value === "object" && "limit" in value) {
    return parsePlanCallsPerHourInput((value as { limit: unknown }).limit);
  }
  if (typeof value === "number") return parsePlanCallsPerHourInput(value);
  return null;
}

export function invalidatePlanCallsPerHourCache(): void {
  cachedPlanCallsPerHour = null;
}

export async function resolvePlanCallsPerHour(): Promise<number> {
  const envLimit = envPlanCallsPerHour();
  if (
    cachedPlanCallsPerHour &&
    Date.now() - cachedPlanCallsPerHour.at < CACHE_MS
  ) {
    return cachedPlanCallsPerHour.value;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return envLimit;

  try {
    const { data, error } = await admin
      .from("elan_app_config")
      .select("value")
      .eq("key", PLAN_CALLS_PER_HOUR_CONFIG_KEY)
      .maybeSingle();

    if (error) return envLimit;

    const stored = parseStoredPlanCallsPerHour(
      (data as { value?: unknown } | null)?.value,
    );
    const limit = stored ?? envLimit;
    cachedPlanCallsPerHour = { value: limit, at: Date.now() };
    return limit;
  } catch {
    return envLimit;
  }
}

export async function readPlanCallsPerHourConfig(): Promise<{
  limit: number;
  source: "db" | "env";
  envDefault: number;
}> {
  const envDefault = envPlanCallsPerHour();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { limit: envDefault, source: "env", envDefault };
  }

  try {
    const { data, error } = await admin
      .from("elan_app_config")
      .select("value")
      .eq("key", PLAN_CALLS_PER_HOUR_CONFIG_KEY)
      .maybeSingle();

    if (error) {
      return { limit: envDefault, source: "env", envDefault };
    }

    const stored = parseStoredPlanCallsPerHour(
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

export async function writePlanCallsPerHour(limit: number): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("supabase-admin-not-configured");

  const parsed = parsePlanCallsPerHourInput(limit);
  if (parsed == null) throw new Error("invalid-limit");

  const { error } = await admin.from("elan_app_config").upsert({
    key: PLAN_CALLS_PER_HOUR_CONFIG_KEY,
    value: { limit: parsed },
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  invalidatePlanCallsPerHourCache();
}
