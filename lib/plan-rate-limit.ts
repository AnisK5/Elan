import { getSupabaseAdmin } from "./supabase-admin";

/** Plafond hard — évite une boucle plan (ex. 101 appels/h). */
export const PLAN_CALLS_PER_HOUR = 10;

const MS_HOUR = 3_600_000;

export interface PlanRateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
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
  const used = await countPlanCallsLastHour(userId);
  return {
    allowed: used < PLAN_CALLS_PER_HOUR,
    used,
    limit: PLAN_CALLS_PER_HOUR,
  };
}
