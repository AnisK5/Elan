import { resolveUserPlanCallsPerHour } from "./user-limits";
import { getSupabaseAdmin } from "./supabase-admin";

/** Défaut documenté — préférer resolveUserPlanCallsPerHour() à l'exécution. */
export { DEFAULT_PLAN_CALLS_PER_HOUR as PLAN_CALLS_PER_HOUR } from "./app-config";

const MS_HOUR = 3_600_000;

export interface PlanRateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  enabled: boolean;
}

export async function countPlanCallsLastHour(
  userId: string | null,
): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const since = new Date(Date.now() - MS_HOUR).toISOString();
  try {
    let q = admin
      .from("elan_api_usage")
      .select("id", { count: "exact", head: true })
      .eq("route", "plan")
      .gte("at", since);
    if (userId) q = q.eq("user_id", userId);
    else q = q.is("user_id", null);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function checkPlanRateLimit(
  userId: string | null,
): Promise<PlanRateLimitStatus> {
  const limit = await resolveUserPlanCallsPerHour(userId);
  const used = await countPlanCallsLastHour(userId);
  const enabled = limit > 0;
  return {
    allowed: !enabled || used < limit,
    used,
    limit,
    enabled,
  };
}
