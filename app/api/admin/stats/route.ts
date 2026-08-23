import { isAdminEmail } from "@/lib/admin";
import {
  buildAdminSnapshot,
  type AdminRawDone,
  type AdminRawEvent,
  type AdminRawSession,
  type AdminRawUser,
} from "@/lib/admin-stats";
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
    const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [authUsers, eventsRes, sessionsRes, settingsRes, donesRes] =
      await Promise.all([
        listAuthUsers(admin),
        admin
          .from("elan_events")
          .select("user_id, kind, at, day, duration_sec")
          .gte("at", since90),
        admin
          .from("elan_sessions")
          .select("user_id, date, duration_min"),
        admin.from("elan_settings").select("user_id, name"),
        admin
          .from("elan_threads")
          .select("user_id, done_at")
          .eq("status", "done")
          .gte("done_at", since30),
      ]);

    const names = new Map<string, string>();
    for (const row of (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
    }[]) {
      if (row.name) names.set(row.user_id, row.name);
    }

    const users: AdminRawUser[] = authUsers.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      name: names.get(u.id),
    }));

    const events: AdminRawEvent[] = (
      (eventsRes.error ? [] : eventsRes.data) ?? []
    ).map((r: {
      user_id: string;
      kind: string;
      at: string;
      day: string;
      duration_sec: number | null;
    }) => ({
      userId: r.user_id,
      kind: r.kind,
      at: r.at,
      day: r.day,
      durationSec: r.duration_sec ?? undefined,
    }));

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

    const dones: AdminRawDone[] = (
      (donesRes.data ?? []) as { user_id: string; done_at: string | null }[]
    )
      .filter((r) => r.done_at)
      .map((r) => ({ userId: r.user_id, at: r.done_at as string }));

    return Response.json(buildAdminSnapshot(users, events, sessions, dones));
  } catch {
    return Response.json({ error: "stats-failed" }, { status: 500 });
  }
}
