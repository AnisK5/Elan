import { isAdminEmail } from "@/lib/admin";
import {
  buildAdminSnapshot,
  type AdminRawDone,
  type AdminRawEvent,
  type AdminRawFeedback,
  type AdminRawFeedbackCount,
  type AdminRawSession,
  type AdminRawSettings,
  type AdminRawThreadCount,
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

function countOpenThreads(
  rows: { user_id: string; status: string }[],
): AdminRawThreadCount[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "open") continue;
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
  }
  return [...map.entries()].map(([userId, open]) => ({ userId, open }));
}

function countFeedback(
  rows: { user_id: string }[],
): AdminRawFeedbackCount[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
  }
  return [...map.entries()].map(([userId, count]) => ({ userId, count }));
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

    const [
      authUsers,
      eventsRes,
      sessionsRes,
      settingsRes,
      donesRes,
      threadsRes,
      feedbackAllRes,
      feedbackRecentRes,
    ] = await Promise.all([
      listAuthUsers(admin),
      admin
        .from("elan_events")
        .select("user_id, kind, at, day, duration_sec, meta")
        .gte("at", since90),
      admin
        .from("elan_sessions")
        .select("user_id, date, duration_min"),
      admin.from("elan_settings").select(
        "user_id, name, notify_enabled, notify_email_enabled, situation",
      ),
      admin
        .from("elan_threads")
        .select("user_id, done_at")
        .eq("status", "done")
        .gte("done_at", since30),
      admin.from("elan_threads").select("user_id, status"),
      admin.from("elan_feedback").select("user_id"),
      admin
        .from("elan_feedback")
        .select("id, user_id, message, mood, source, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const settingsRows = (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
      notify_enabled: boolean | null;
      notify_email_enabled: boolean | null;
      situation: string | null;
    }[];

    const names = new Map<string, string>();
    const settings: AdminRawSettings[] = settingsRows.map((row) => {
      if (row.name) names.set(row.user_id, row.name);
      return {
        userId: row.user_id,
        name: row.name ?? undefined,
        notifyEnabled: row.notify_enabled ?? false,
        notifyEmailEnabled: row.notify_email_enabled ?? false,
        situation: row.situation ?? undefined,
      };
    });

    const users: AdminRawUser[] = authUsers.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      name: names.get(u.id),
    }));

    const userEmails = new Map(users.map((u) => [u.id, u.email]));

    const events: AdminRawEvent[] = (
      (eventsRes.error ? [] : eventsRes.data) ?? []
    ).map((r: {
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

    const threadCounts = countOpenThreads(
      (threadsRes.data ?? []) as { user_id: string; status: string }[],
    );

    const feedbackCounts = countFeedback(
      (feedbackAllRes.data ?? []) as { user_id: string }[],
    );

    const recentFeedback: AdminRawFeedback[] = (
      (feedbackRecentRes.data ?? []) as {
        id: string;
        user_id: string;
        message: string;
        mood: string | null;
        source: string;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      userId: r.user_id,
      message: r.message,
      mood: r.mood,
      source: r.source,
      createdAt: r.created_at,
    }));

    return Response.json(
      buildAdminSnapshot(
        users,
        events,
        sessions,
        dones,
        settings,
        threadCounts,
        feedbackCounts,
        recentFeedback,
        userEmails,
        names,
      ),
    );
  } catch {
    return Response.json({ error: "stats-failed" }, { status: 500 });
  }
}
