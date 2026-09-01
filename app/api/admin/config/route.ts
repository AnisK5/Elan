import { isAdminEmail } from "@/lib/admin";
import {
  parseSharedTokenLimitInput,
  readSharedDailyTokenLimitConfig,
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
    const cfg = await readSharedDailyTokenLimitConfig();
    return Response.json({
      sharedDailyTokenLimit: cfg.limit,
      source: cfg.source,
      envDefault: cfg.envDefault,
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

  let body: { sharedDailyTokenLimit?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  const limit = parseSharedTokenLimitInput(body.sharedDailyTokenLimit);
  if (limit == null) {
    return Response.json({ error: "invalid-limit" }, { status: 400 });
  }

  try {
    await writeSharedDailyTokenLimit(limit);
    return Response.json({
      ok: true,
      sharedDailyTokenLimit: limit,
      source: "db" as const,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "supabase-admin-not-configured") {
      return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
    }
    return Response.json({ error: "config-write-failed" }, { status: 500 });
  }
}
