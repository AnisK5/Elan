/** Plafonds IA — défauts globaux + overrides par utilisateur. */

import {
  DEFAULT_PLAN_CALLS_PER_HOUR,
  DEFAULT_SHARED_DAILY_TOKEN_LIMIT,
  isUnlimitedSharedTokenLimit,
  MAX_PLAN_CALLS_PER_HOUR,
  MAX_SHARED_DAILY_TOKEN_LIMIT,
  MIN_SHARED_DAILY_TOKEN_LIMIT,
  parsePlanCallsPerHourInput,
  parseSharedTokenLimitInput,
  resolvePlanCallsPerHour,
  resolveSharedDailyTokenLimit,
  UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
  writePlanCallsPerHour,
  writeSharedDailyTokenLimit,
} from "./app-config";
import { getSupabaseAdmin } from "./supabase-admin";

export const USER_LIMIT_OVERRIDES_KEY = "user_limit_overrides";

export interface UserLimitOverride {
  /** null = hérite du défaut global. 0 = illimité. */
  dailyTokens: number | null;
  /** null = hérite. 0 = plafond plan désactivé. */
  planPerHour: number | null;
}

export type UserLimitOverridesMap = Record<string, UserLimitOverride>;

const CACHE_MS = 15_000;
let cachedOverrides: { value: UserLimitOverridesMap; at: number } | null =
  null;

export function emptyOverride(): UserLimitOverride {
  return { dailyTokens: null, planPerHour: null };
}

export function parseUserLimitOverride(raw: unknown): UserLimitOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let dailyTokens: number | null = null;
  let planPerHour: number | null = null;

  if ("dailyTokens" in o) {
    if (o.dailyTokens === null || o.dailyTokens === "inherit") {
      dailyTokens = null;
    } else {
      const p = parseSharedTokenLimitInput(o.dailyTokens);
      if (p == null) return null;
      dailyTokens = p;
    }
  }
  if ("planPerHour" in o) {
    if (o.planPerHour === null || o.planPerHour === "inherit") {
      planPerHour = null;
    } else {
      const p = parsePlanCallsPerHourInput(o.planPerHour);
      if (p == null) return null;
      planPerHour = p;
    }
  }
  return { dailyTokens, planPerHour };
}

export function parseUserLimitOverridesMap(
  raw: unknown,
): UserLimitOverridesMap {
  if (!raw || typeof raw !== "object") return {};
  const out: UserLimitOverridesMap = {};
  for (const [uid, v] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseUserLimitOverride(v);
    if (!parsed) continue;
    if (parsed.dailyTokens == null && parsed.planPerHour == null) continue;
    out[uid] = parsed;
  }
  return out;
}

export function invalidateUserLimitOverridesCache(): void {
  cachedOverrides = null;
}

export async function readUserLimitOverrides(): Promise<UserLimitOverridesMap> {
  if (cachedOverrides && Date.now() - cachedOverrides.at < CACHE_MS) {
    return cachedOverrides.value;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  try {
    const { data, error } = await admin
      .from("elan_app_config")
      .select("value")
      .eq("key", USER_LIMIT_OVERRIDES_KEY)
      .maybeSingle();
    if (error) return {};
    const map = parseUserLimitOverridesMap(
      (data as { value?: unknown } | null)?.value,
    );
    cachedOverrides = { value: map, at: Date.now() };
    return map;
  } catch {
    return {};
  }
}

export async function writeUserLimitOverride(
  userId: string,
  patch: Partial<UserLimitOverride>,
): Promise<UserLimitOverride> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("supabase-admin-not-configured");
  if (!userId.trim()) throw new Error("invalid-user");

  const current = await readUserLimitOverrides();
  const prev = current[userId] ?? emptyOverride();
  const next: UserLimitOverride = {
    dailyTokens:
      patch.dailyTokens !== undefined ? patch.dailyTokens : prev.dailyTokens,
    planPerHour:
      patch.planPerHour !== undefined ? patch.planPerHour : prev.planPerHour,
  };

  if (next.dailyTokens != null) {
    const p = parseSharedTokenLimitInput(next.dailyTokens);
    if (p == null) throw new Error("invalid-daily-tokens");
    next.dailyTokens = p;
  }
  if (next.planPerHour != null) {
    const p = parsePlanCallsPerHourInput(next.planPerHour);
    if (p == null) throw new Error("invalid-plan-per-hour");
    next.planPerHour = p;
  }

  const map = { ...current };
  if (next.dailyTokens == null && next.planPerHour == null) {
    delete map[userId];
  } else {
    map[userId] = next;
  }

  const { error } = await admin.from("elan_app_config").upsert({
    key: USER_LIMIT_OVERRIDES_KEY,
    value: map,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  invalidateUserLimitOverridesCache();
  return next;
}

export async function resolveUserDailyTokenLimit(
  userId: string | null,
): Promise<number> {
  const global = await resolveSharedDailyTokenLimit();
  if (!userId) return global;
  const overrides = await readUserLimitOverrides();
  const o = overrides[userId];
  if (!o || o.dailyTokens == null) return global;
  return o.dailyTokens;
}

export async function resolveUserPlanCallsPerHour(
  userId: string | null,
): Promise<number> {
  const global = await resolvePlanCallsPerHour();
  if (!userId) return global;
  const overrides = await readUserLimitOverrides();
  const o = overrides[userId];
  if (!o || o.planPerHour == null) return global;
  return o.planPerHour;
}

export async function writeGlobalLimits(opts: {
  dailyTokens?: number;
  planPerHour?: number;
}): Promise<void> {
  if (opts.dailyTokens !== undefined) {
    await writeSharedDailyTokenLimit(opts.dailyTokens);
  }
  if (opts.planPerHour !== undefined) {
    await writePlanCallsPerHour(opts.planPerHour);
  }
}

export {
  DEFAULT_PLAN_CALLS_PER_HOUR,
  DEFAULT_SHARED_DAILY_TOKEN_LIMIT,
  isUnlimitedSharedTokenLimit,
  MAX_PLAN_CALLS_PER_HOUR,
  MAX_SHARED_DAILY_TOKEN_LIMIT,
  MIN_SHARED_DAILY_TOKEN_LIMIT,
  UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
};
