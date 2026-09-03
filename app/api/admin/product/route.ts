import { isAdminEmail } from "@/lib/admin";
import {
  buildAdminProduct,
  type ProductFilters,
  type ProductGranularity,
  type ProductTab,
  type RawAdminAlert,
  type RawApiFrictionRow,
} from "@/lib/admin-product";
import type {
  AdminRawEvent,
  AdminRawSession,
  AdminRawUser,
} from "@/lib/admin-stats";
import type { AcquisitionInfo } from "@/lib/acquisition";
import { resolvePlanCallsPerHour } from "@/lib/app-config";
import { getUserFromBearer } from "@/lib/auth-request";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuthUserLike {
  id: string;
  email?: string;
  created_at: string;
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

function parseTab(raw: string | null): ProductTab {
  if (
    raw === "engagement" ||
    raw === "retention" ||
    raw === "acquisition" ||
    raw === "friction" ||
    raw === "overview"
  ) {
    return raw;
  }
  return "overview";
}

function parseGranularity(raw: string | null): ProductGranularity {
  return raw === "hour" ? "hour" : "day";
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
    return Response.json(
      { error: "supabase-admin-not-configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  let days = Number.parseInt(url.searchParams.get("days") ?? "30", 10);
  if (!Number.isFinite(days)) days = 30;
  days = Math.min(90, Math.max(1, days));
  const granularity = parseGranularity(url.searchParams.get("granularity"));
  if (granularity === "hour") days = Math.min(days, 7);
  const userId = url.searchParams.get("userId") || undefined;
  const tab = parseTab(url.searchParams.get("tab"));

  const filters: ProductFilters = {
    days,
    granularity,
    userId,
    tab,
  };

  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const sinceEvents = new Date(
      Date.now() - Math.max(days, 90) * 86_400_000,
    ).toISOString();

    const [
      authUsers,
      eventsRes,
      sessionsRes,
      settingsRes,
      apiRes,
      alertsRes,
      planLimit,
    ] = await Promise.all([
      listAuthUsers(admin),
      admin
        .from("elan_events")
        .select("user_id, kind, at, day, duration_sec, meta")
        .gte("at", sinceEvents)
        .limit(20_000),
      admin.from("elan_sessions").select("user_id, date, duration_min"),
      admin
        .from("elan_settings")
        .select("user_id, name, acquisition"),
      admin
        .from("elan_api_usage")
        .select("user_id, at, route, model, stop_reason, latency_ms")
        .gte("at", since)
        .limit(10_000),
      admin
        .from("elan_admin_alerts")
        .select("kind, sent_at, meta")
        .order("sent_at", { ascending: false })
        .limit(50),
      resolvePlanCallsPerHour(),
    ]);

    const settingsRows = (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
      acquisition: AcquisitionInfo | null;
    }[];

    const names = new Map<string, string>();
    const acquisitionByUser = new Map<string, AcquisitionInfo | null>();
    for (const row of settingsRows) {
      if (row.name) names.set(row.user_id, row.name);
      acquisitionByUser.set(row.user_id, row.acquisition ?? null);
    }

    const users: AdminRawUser[] = authUsers.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      name: names.get(u.id),
    }));
    const userEmails = new Map(users.map((u) => [u.id, u.email]));

    const events: AdminRawEvent[] = (
      (eventsRes.error ? [] : eventsRes.data) ?? []
    ).map(
      (r: {
        user_id: string;
        kind: string;
        at: string;
        day: string;
        duration_sec: number | null;
        meta: Record<string, unknown> | null;
      }) => ({
        userId: r.user_id,
        kind: r.kind,
        at: r.at,
        day: r.day,
        durationSec: r.duration_sec ?? undefined,
        meta: r.meta ?? undefined,
      }),
    );

    const sessions: AdminRawSession[] = (
      (sessionsRes.data ?? []) as {
        user_id: string;
        date: string;
        duration_min: number;
      }[]
    ).map((r) => ({
      userId: r.user_id,
      date: r.date,
      durationMin: r.duration_min,
    }));

    const apiRows: RawApiFrictionRow[] = (
      (apiRes.error ? [] : apiRes.data) ?? []
    ).map(
      (r: {
        user_id: string | null;
        at: string;
        route: string;
        model: string;
        stop_reason: string | null;
        latency_ms: number | null;
      }) => ({
        userId: r.user_id,
        at: r.at,
        route: r.route,
        model: r.model,
        stopReason: r.stop_reason,
        latencyMs: r.latency_ms,
      }),
    );

    const alerts: RawAdminAlert[] = (
      (alertsRes.error ? [] : alertsRes.data) ?? []
    ).map(
      (r: {
        kind: string;
        sent_at: string;
        meta: Record<string, unknown> | null;
      }) => ({
        kind: r.kind,
        sentAt: r.sent_at,
        meta: r.meta,
      }),
    );

    return Response.json(
      buildAdminProduct(
        users,
        events,
        sessions,
        acquisitionByUser,
        apiRows,
        alerts,
        userEmails,
        names,
        filters,
        planLimit,
      ),
    );
  } catch {
    return Response.json({ error: "product-failed" }, { status: 500 });
  }
}
