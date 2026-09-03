import { isAdminEmail } from "@/lib/admin";
import { countPlanCallsLastHour } from "@/lib/plan-rate-limit";
import { totalTokens } from "@/lib/api-usage";
import { estimateUsageCostEur, estimateEurFromTotalTokens } from "@/lib/anthropic-pricing";
import {
  readPlanCallsPerHourConfig,
  readSharedDailyTokenLimitConfig,
} from "@/lib/app-config";
import { getUserFromBearer } from "@/lib/auth-request";
import { listUtcDays } from "@/lib/chart-series";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  readUserLimitOverrides,
  writeGlobalLimits,
  writeUserLimitOverride,
  type UserLimitOverride,
} from "@/lib/user-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuthUserLike {
  id: string;
  email?: string;
}

async function listAuthUsers(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<AuthUserLike[]> {
  const out: AuthUserLike[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data.users ?? [];
    out.push(...batch);
    if (batch.length < 200) break;
  }
  return out;
}

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
  }

  try {
    const day = new Date().toISOString().slice(0, 10);
    const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [tokenCfg, planCfg, overrides, authUsers, settingsRes, usageToday, usage7] =
      await Promise.all([
        readSharedDailyTokenLimitConfig(),
        readPlanCallsPerHourConfig(),
        readUserLimitOverrides(),
        listAuthUsers(admin),
        admin.from("elan_settings").select("user_id, name"),
        admin
          .from("elan_api_usage")
          .select("user_id, input_tokens, output_tokens, model, route")
          .eq("day", day),
        admin
          .from("elan_api_usage")
          .select("user_id, input_tokens, output_tokens, model, day")
          .gte("at", since7),
      ]);

    const names = new Map<string, string>();
    for (const row of (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
    }[]) {
      if (row.name) names.set(row.user_id, row.name);
    }

    type Agg = {
      todayIn: number;
      todayOut: number;
      todayCost: number;
      weekIn: number;
      weekOut: number;
      weekCost: number;
      planToday: number;
      costByDay: Map<string, number>;
    };
    const byUser = new Map<string, Agg>();

    function ensure(uid: string): Agg {
      let a = byUser.get(uid);
      if (!a) {
        a = {
          todayIn: 0,
          todayOut: 0,
          todayCost: 0,
          weekIn: 0,
          weekOut: 0,
          weekCost: 0,
          planToday: 0,
          costByDay: new Map(),
        };
        byUser.set(uid, a);
      }
      return a;
    }

    for (const r of (usageToday.error ? [] : usageToday.data) ?? []) {
      const row = r as {
        user_id: string | null;
        input_tokens: number;
        output_tokens: number;
        model: string;
        route: string;
      };
      if (!row.user_id) continue;
      const a = ensure(row.user_id);
      a.todayIn += row.input_tokens ?? 0;
      a.todayOut += row.output_tokens ?? 0;
      a.todayCost += estimateUsageCostEur(
        row.model,
        row.input_tokens ?? 0,
        row.output_tokens ?? 0,
      );
      if (row.route === "plan") a.planToday += 1;
    }

    for (const r of (usage7.error ? [] : usage7.data) ?? []) {
      const row = r as {
        user_id: string | null;
        input_tokens: number;
        output_tokens: number;
        model: string;
        day: string;
      };
      if (!row.user_id) continue;
      const a = ensure(row.user_id);
      a.weekIn += row.input_tokens ?? 0;
      a.weekOut += row.output_tokens ?? 0;
      const cost = estimateUsageCostEur(
        row.model,
        row.input_tokens ?? 0,
        row.output_tokens ?? 0,
      );
      a.weekCost += cost;
      if (row.day) {
        a.costByDay.set(row.day, (a.costByDay.get(row.day) ?? 0) + cost);
      }
    }

    const defaultDaily = tokenCfg.limit;
    const defaultPlan = planCfg.limit;
    const weekDays = listUtcDays(7);

    const people = authUsers.map((u) => {
      const agg = byUser.get(u.id) ?? {
        todayIn: 0,
        todayOut: 0,
        todayCost: 0,
        weekIn: 0,
        weekOut: 0,
        weekCost: 0,
        planToday: 0,
        costByDay: new Map<string, number>(),
      };
      const ov = overrides[u.id];
      const dailyLimit =
        ov?.dailyTokens != null ? ov.dailyTokens : defaultDaily;
      const planLimit =
        ov?.planPerHour != null ? ov.planPerHour : defaultPlan;
      const todayTokens = totalTokens(agg.todayIn, agg.todayOut);
      const weekTokens = totalTokens(agg.weekIn, agg.weekOut);
      const dailyLimitEur =
        dailyLimit > 0 ? estimateEurFromTotalTokens(dailyLimit) : 0;
      const dailyPct =
        dailyLimitEur > 0
          ? Math.min(999, Math.round((agg.todayCost / dailyLimitEur) * 100))
          : dailyLimit > 0
            ? Math.min(999, Math.round((todayTokens / dailyLimit) * 100))
            : 0;

      return {
        userId: u.id,
        email: u.email ?? "",
        name: names.get(u.id),
        todayTokens,
        todayCostEur: agg.todayCost,
        weekTokens,
        weekCostEur: agg.weekCost,
        planCallsToday: agg.planToday,
        override: ov ?? { dailyTokens: null, planPerHour: null },
        effectiveDailyTokens: dailyLimit,
        effectiveDailyLimitEur: dailyLimitEur,
        effectivePlanPerHour: planLimit,
        dailyPct,
        customDaily: ov?.dailyTokens != null,
        customPlan: ov?.planPerHour != null,
        costByDay: weekDays.map((d) => ({
          day: d,
          costEur: agg.costByDay.get(d) ?? 0,
        })),
      };
    });

    people.sort((a, b) => b.todayTokens - a.todayTokens || b.weekTokens - a.weekTokens);

    // Enrich plan/hour used for top active users (sliding hour) — batch limited
    const top = people.filter((p) => p.weekTokens > 0 || p.customDaily || p.customPlan).slice(0, 40);
    await Promise.all(
      top.map(async (p) => {
        const used = await countPlanCallsLastHour(p.userId);
        (p as { planCallsLastHour?: number }).planCallsLastHour = used;
      }),
    );

    return Response.json({
      day,
      defaults: {
        dailyTokens: defaultDaily,
        dailyTokensSource: tokenCfg.source,
        planPerHour: defaultPlan,
        planPerHourSource: planCfg.source,
      },
      people,
      presets: {
        dailyTokens: [80_000, 120_000, 200_000, 0],
        planPerHour: [5, 10, 20, 50, 0],
      },
    });
  } catch {
    return Response.json({ error: "limits-failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
  }

  let body: {
    scope?: "global" | "user";
    userId?: string;
    dailyTokens?: number | null;
    planPerHour?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  try {
    if (body.scope === "global") {
      const patch: { dailyTokens?: number; planPerHour?: number } = {};
      if (typeof body.dailyTokens === "number") patch.dailyTokens = body.dailyTokens;
      if (typeof body.planPerHour === "number") patch.planPerHour = body.planPerHour;
      if (Object.keys(patch).length === 0) {
        return Response.json({ error: "nothing-to-update" }, { status: 400 });
      }
      await writeGlobalLimits(patch);
      return Response.json({ ok: true, scope: "global", ...patch });
    }

    if (body.scope === "user") {
      if (!body.userId) {
        return Response.json({ error: "missing-user" }, { status: 400 });
      }
      const patch: Partial<UserLimitOverride> = {};
      if ("dailyTokens" in body) patch.dailyTokens = body.dailyTokens ?? null;
      if ("planPerHour" in body) patch.planPerHour = body.planPerHour ?? null;
      const next = await writeUserLimitOverride(body.userId, patch);
      return Response.json({ ok: true, scope: "user", userId: body.userId, override: next });
    }

    return Response.json({ error: "invalid-scope" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("invalid-")) {
      return Response.json({ error: msg }, { status: 400 });
    }
    return Response.json({ error: "limits-write-failed" }, { status: 500 });
  }
}
