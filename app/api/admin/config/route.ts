import { isAdminEmail } from "@/lib/admin";
import {
  parsePlanCallsPerHourInput,
  parseSharedTokenLimitInput,
  readPlanCallsPerHourConfig,
  readSharedDailyTokenLimitConfig,
  writePlanCallsPerHour,
  writeSharedDailyTokenLimit,
} from "@/lib/app-config";
import { getUserFromBearer } from "@/lib/auth-request";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const [tokenCfg, planCfg] = await Promise.all([
      readSharedDailyTokenLimitConfig(),
      readPlanCallsPerHourConfig(),
    ]);
    return Response.json({
      sharedDailyTokenLimit: tokenCfg.limit,
      sharedDailyTokenSource: tokenCfg.source,
      sharedDailyTokenEnvDefault: tokenCfg.envDefault,
      planCallsPerHour: planCfg.limit,
      planCallsPerHourSource: planCfg.source,
      planCallsPerHourEnvDefault: planCfg.envDefault,
    });
  } catch {
    return Response.json({ error: "config-read-failed" }, { status: 500 });
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
    sharedDailyTokenLimit?: unknown;
    planCallsPerHour?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  if (
    body.sharedDailyTokenLimit === undefined &&
    body.planCallsPerHour === undefined
  ) {
    return Response.json({ error: "nothing-to-update" }, { status: 400 });
  }

  try {
    const out: Record<string, unknown> = { ok: true };

    if (body.sharedDailyTokenLimit !== undefined) {
      const limit = parseSharedTokenLimitInput(body.sharedDailyTokenLimit);
      if (limit == null) {
        return Response.json({ error: "invalid-token-limit" }, { status: 400 });
      }
      await writeSharedDailyTokenLimit(limit);
      out.sharedDailyTokenLimit = limit;
      out.sharedDailyTokenSource = "db";
    }

    if (body.planCallsPerHour !== undefined) {
      const limit = parsePlanCallsPerHourInput(body.planCallsPerHour);
      if (limit == null) {
        return Response.json({ error: "invalid-plan-limit" }, { status: 400 });
      }
      await writePlanCallsPerHour(limit);
      out.planCallsPerHour = limit;
      out.planCallsPerHourSource = "db";
    }

    return Response.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "supabase-admin-not-configured") {
      return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
    }
    return Response.json({ error: "config-write-failed" }, { status: 500 });
  }
}
