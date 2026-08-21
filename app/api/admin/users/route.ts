import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS ?? "";
  return env
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Vérifie que le token Bearer appartient à un admin. */
async function checkAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return false;

  const sb = getSupabaseAdmin();
  if (!sb) return false;

  const { data } = await sb.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase() ?? "";
  if (!email) return false;

  const allowed = adminEmails();
  return allowed.length === 0
    ? false // si rien de configuré, on refuse tout
    : allowed.includes(email);
}

export interface UserStats {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSignIn: string | null;
  // Séances
  totalSessions: number;
  totalMinutes: number;
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  avgSessionMinutes: number;
  // Threads
  threadsTotal: number;
  threadsDone: number;
  threadsOpen: number;
  threadsSnoozed: number;
  completionRate: number; // done / (done + open + snoozed)
  // Récurrence — sessions par semaine (sur les 30 derniers jours)
  sessionsPerWeek: number;
  // Notifications
  notifyEnabled: boolean;
  notifyEmailEnabled: boolean;
}

export async function GET(req: NextRequest) {
  const ok = await checkAdmin(req);
  if (!ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json(
      { error: "Supabase admin not configured" },
      { status: 503 },
    );
  }

  // ── 1. Liste des utilisateurs (auth.users via admin API) ──────────────────
  const { data: listData, error: listErr } = await sb.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) {
    return Response.json({ error: listErr.message }, { status: 500 });
  }
  const authUsers = listData?.users ?? [];

  if (authUsers.length === 0) {
    return Response.json({ users: [] });
  }

  const userIds = authUsers.map((u) => u.id);

  // ── 2. Séances ─────────────────────────────────────────────────────────────
  const { data: sessions } = await sb
    .from("elan_sessions")
    .select("user_id, date, duration_min")
    .in("user_id", userIds);

  // ── 3. Threads ─────────────────────────────────────────────────────────────
  const { data: threads } = await sb
    .from("elan_threads")
    .select("user_id, status, created_at")
    .in("user_id", userIds);

  // ── 4. Settings (nom + notifs) ─────────────────────────────────────────────
  const { data: settings } = await sb
    .from("elan_settings")
    .select("user_id, name, notify_enabled, notify_email_enabled")
    .in("user_id", userIds);

  // ── 5. Agrégation par utilisateur ─────────────────────────────────────────
  const now = Date.now();
  const day = 86_400_000;

  const statsMap: UserStats[] = authUsers.map((u) => {
    const uid = u.id;

    // Sessions
    const userSessions = (sessions ?? []).filter((s) => s.user_id === uid);
    const totalSessions = userSessions.length;
    const totalMinutes = userSessions.reduce(
      (acc, s) => acc + (s.duration_min ?? 0),
      0,
    );
    const avgSessionMinutes =
      totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const sessionDates = userSessions
      .map((s) => Date.parse(s.date))
      .filter(Number.isFinite);
    const lastSessionTs =
      sessionDates.length > 0 ? Math.max(...sessionDates) : null;
    const lastSessionDate = lastSessionTs
      ? new Date(lastSessionTs).toISOString()
      : null;
    const daysSinceLastSession =
      lastSessionTs !== null
        ? Math.max(0, Math.round((now - lastSessionTs) / day))
        : null;

    const since7 = now - 7 * day;
    const since30 = now - 30 * day;
    const sessionsLast7Days = sessionDates.filter((d) => d >= since7).length;
    const sessionsLast30Days = sessionDates.filter((d) => d >= since30).length;
    const sessionsPerWeek = Math.round((sessionsLast30Days / 30) * 7 * 10) / 10;

    // Threads
    const userThreads = (threads ?? []).filter((t) => t.user_id === uid);
    const threadsTotal = userThreads.length;
    const threadsDone = userThreads.filter((t) => t.status === "done").length;
    const threadsOpen = userThreads.filter((t) => t.status === "open").length;
    const threadsSnoozed = userThreads.filter(
      (t) => t.status === "snoozed",
    ).length;
    const denominator = threadsDone + threadsOpen + threadsSnoozed;
    const completionRate =
      denominator > 0 ? Math.round((threadsDone / denominator) * 100) : 0;

    // Settings
    const userSettings = (settings ?? []).find((s) => s.user_id === uid);

    return {
      id: uid,
      email: u.email ?? "",
      name: userSettings?.name ?? null,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      totalSessions,
      totalMinutes,
      lastSessionDate,
      daysSinceLastSession,
      sessionsLast7Days,
      sessionsLast30Days,
      avgSessionMinutes,
      threadsTotal,
      threadsDone,
      threadsOpen,
      threadsSnoozed,
      completionRate,
      sessionsPerWeek,
      notifyEnabled: Boolean(userSettings?.notify_enabled),
      notifyEmailEnabled: Boolean(userSettings?.notify_email_enabled),
    };
  });

  // Tri : utilisateurs actifs en premier (dernier usage récent)
  statsMap.sort((a, b) => {
    const ta = a.lastSessionDate ? Date.parse(a.lastSessionDate) : 0;
    const tb = b.lastSessionDate ? Date.parse(b.lastSessionDate) : 0;
    return tb - ta;
  });

  return Response.json({ users: statsMap });
}
