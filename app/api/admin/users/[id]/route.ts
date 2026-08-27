import { isAdminEmail } from "@/lib/admin";
import {
  buildAdminSnapshot,
  type AdminRawDone,
  type AdminRawEvent,
  type AdminRawSession,
  type AdminRawUser,
} from "@/lib/admin-stats";
import {
  buildAdminUserDetail,
  type AdminFeedbackItem,
  type AdminRawUserDetailEvent,
  type AdminRawUserDetailSession,
  type AdminRawUserDetailSettings,
  type AdminRawUserDetailThread,
  type AdminRawUserDetailUsage,
} from "@/lib/admin-user-detail";
import { getUserFromBearer } from "@/lib/auth-request";
import type { ChatMessage } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: userId } = await ctx.params;

  try {
    const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const authRes = await admin.auth.admin.getUserById(userId);
    const authUser = authRes.data.user;
    if (!authUser) {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    const [
      eventsRes,
      sessionsRes,
      settingsRes,
      threadsRes,
      donesRes,
      feedbackRes,
      pushRes,
      usageRes,
    ] = await Promise.all([
      admin
        .from("elan_events")
        .select("kind, at, day, duration_sec, meta")
        .eq("user_id", userId)
        .gte("at", since90)
        .order("at", { ascending: false }),
      admin
        .from("elan_sessions")
        .select("id, date, duration_min, context, transcript")
        .eq("user_id", userId)
        .order("date", { ascending: false }),
      admin
        .from("elan_settings")
        .select(
          "name, default_duration_min, notify_enabled, notify_email_enabled, notify_time, notify_timezone, situation, situation_until",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("elan_threads")
        .select(
          "id, text, kind, status, created_at, done_at, touched_at, note, effort, due",
        )
        .eq("user_id", userId),
      admin
        .from("elan_threads")
        .select("done_at")
        .eq("user_id", userId)
        .eq("status", "done")
        .gte("done_at", since30),
      admin
        .from("elan_feedback")
        .select("id, message, mood, source, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      admin
        .from("elan_push_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
      admin
        .from("elan_api_usage")
        .select(
          "id, at, route, model, input_tokens, output_tokens, exchange_kind, exchange_index, session_id, session_context, stop_reason, latency_ms",
        )
        .eq("user_id", userId)
        .gte("at", since90)
        .order("at", { ascending: false })
        .limit(500),
    ]);

    const settingsRow = settingsRes.data as {
      name: string | null;
      default_duration_min: number;
      notify_enabled: boolean | null;
      notify_email_enabled: boolean | null;
      notify_time: string | null;
      notify_timezone: string | null;
      situation: string | null;
      situation_until: string | null;
    } | null;

    const settings: AdminRawUserDetailSettings = {
      name: settingsRow?.name ?? undefined,
      defaultDurationMin: settingsRow?.default_duration_min ?? 15,
      notifyEnabled: settingsRow?.notify_enabled ?? false,
      notifyEmailEnabled: settingsRow?.notify_email_enabled ?? false,
      notifyTime: settingsRow?.notify_time ?? "09:00",
      notifyTimezone: settingsRow?.notify_timezone ?? "Europe/Paris",
      situation: settingsRow?.situation ?? undefined,
      situationUntil: settingsRow?.situation_until ?? undefined,
    };

    const events: AdminRawUserDetailEvent[] = (
      (eventsRes.data ?? []) as {
        kind: string;
        at: string;
        day: string;
        duration_sec: number | null;
        meta: Record<string, unknown> | null;
      }[]
    ).map((r) => ({
      kind: r.kind,
      at: r.at,
      day: r.day,
      durationSec: r.duration_sec ?? undefined,
      meta: r.meta ?? undefined,
    }));

    const sessions: AdminRawUserDetailSession[] = (
      (sessionsRes.data ?? []) as {
        id: string;
        date: string;
        duration_min: number;
        context: string | null;
        transcript: ChatMessage[];
      }[]
    ).map((r) => ({
      id: r.id,
      date: r.date,
      durationMin: r.duration_min,
      context: r.context ?? undefined,
      transcript: r.transcript ?? [],
    }));

    const threads: AdminRawUserDetailThread[] = (
      (threadsRes.data ?? []) as {
        id: string;
        text: string;
        kind: string;
        status: string;
        created_at: string;
        done_at: string | null;
        touched_at: string | null;
        note: string | null;
        effort: string | null;
        due: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      text: r.text,
      kind: r.kind,
      status: r.status,
      createdAt: r.created_at,
      doneAt: r.done_at ?? undefined,
      touchedAt: r.touched_at ?? undefined,
      note: r.note ?? undefined,
      effort: r.effort ?? undefined,
      due: r.due ?? undefined,
    }));

    const usageLog: AdminRawUserDetailUsage[] = (
      (usageRes.error ? [] : usageRes.data) ?? []
    ).map((r: {
      id: string;
      at: string;
      route: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      exchange_kind: string | null;
      exchange_index: number | null;
      session_id: string | null;
      session_context: string | null;
      stop_reason: string | null;
      latency_ms: number | null;
    }) => ({
      id: r.id,
      at: r.at,
      route: r.route,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      exchangeKind: r.exchange_kind,
      exchangeIndex: r.exchange_index,
      sessionId: r.session_id,
      sessionContext: r.session_context,
      stopReason: r.stop_reason,
      latencyMs: r.latency_ms,
    }));

    const feedbacks: AdminFeedbackItem[] = (
      (feedbackRes.data ?? []) as {
        id: string;
        message: string;
        mood: string | null;
        source: string;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      message: r.message,
      mood: r.mood,
      source: r.source,
      createdAt: r.created_at,
    }));

    const allEvents: AdminRawEvent[] = events.map((e) => ({
      userId,
      kind: e.kind,
      at: e.at,
      day: e.day,
      durationSec: e.durationSec,
      meta: e.meta,
    }));

    const allSessions: AdminRawSession[] = sessions.map((s) => ({
      userId,
      date: s.date,
      durationMin: s.durationMin,
    }));

    const dones: AdminRawDone[] = (
      (donesRes.data ?? []) as { done_at: string | null }[]
    )
      .filter((r) => r.done_at)
      .map((r) => ({ userId, at: r.done_at as string }));

    const openThreads = threads.filter((t) => t.status === "open").length;

    const targetUser: AdminRawUser = {
      id: userId,
      email: authUser.email ?? "",
      createdAt: authUser.created_at,
      name: settings.name,
    };

    const snap = buildAdminSnapshot(
      [targetUser],
      allEvents,
      allSessions,
      dones,
      [
        {
          userId,
          name: settings.name,
          notifyEnabled: settings.notifyEnabled,
          notifyEmailEnabled: settings.notifyEmailEnabled,
          situation: settings.situation,
        },
      ],
      [{ userId, open: openThreads }],
      [{ userId, count: feedbacks.length }],
    );

    const engagement = snap.users[0];
    if (!engagement) {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    const detail = buildAdminUserDetail(
      userId,
      authUser.email ?? "",
      authUser.created_at,
      settings,
      engagement,
      threads,
      events,
      sessions,
      feedbacks,
      usageLog,
      (pushRes.data ?? []).length > 0,
    );

    return Response.json(detail);
  } catch {
    return Response.json({ error: "detail-failed" }, { status: 500 });
  }
}
