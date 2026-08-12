import {
  buildRitualNotification,
  dateKeyInTimezone,
  isNotifyTimeNow,
  type PlanStatsForNotify,
} from "./notifications";
import { generatePlanViaApi } from "./plan-fetch";
import { computePlanStats } from "./plan-stats";
import {
  isPushSubscriptionGone,
  sendWebPush,
  type PushSubscriptionRow,
} from "./push-server";
import { getSupabaseAdmin } from "./supabase-admin";
import type { Effort, SessionLog, Thread, ThreadKind } from "./types";

interface SettingsCronRow {
  user_id: string;
  name: string | null;
  notify_time: string;
  notify_timezone: string | null;
  notify_last_sent: string | null;
}

interface ThreadRow {
  id: string;
  text: string;
  kind: string;
  status: string;
  created_at: string;
  due: string | null;
  effort: string | null;
  energy: string | null;
  note: string | null;
  touched_at: string | null;
  done_at: string | null;
  snoozed_until: string | null;
  planned_for: string | null;
  project_id: string | null;
}

interface SessionRow {
  id: string;
  date: string;
  duration_min: number;
  transcript: SessionLog["transcript"];
}

function mapThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    text: r.text,
    kind: r.kind as ThreadKind,
    status: r.status as Thread["status"],
    createdAt: r.created_at,
    due: r.due ?? undefined,
    effort: (r.effort as Effort | null) ?? undefined,
    energy: (r.energy as Thread["energy"]) ?? undefined,
    note: r.note ?? undefined,
    touchedAt: r.touched_at ?? undefined,
    doneAt: r.done_at ?? undefined,
    snoozedUntil: r.snoozed_until ?? undefined,
    plannedFor: r.planned_for ?? undefined,
    projectId: r.project_id ?? undefined,
  };
}

function mapSession(r: SessionRow): SessionLog {
  return {
    id: r.id,
    date: r.date,
    durationMin: r.duration_min,
    transcript: r.transcript ?? [],
  };
}

function dayStartMsInTimezone(timezone: string, at = new Date()): number {
  const key = dateKeyInTimezone(timezone, at);
  const [y, m, d] = key.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(fmt.format(new Date(utcGuess)));
  return utcGuess - hour * 3_600_000;
}

function hadSessionToday(
  sessions: SessionLog[],
  timezone: string,
  at = new Date(),
): boolean {
  const key = dateKeyInTimezone(timezone, at);
  return sessions.some(
    (s) => dateKeyInTimezone(timezone, new Date(s.date)) === key,
  );
}

export async function runRitualPushCron(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("supabase-admin-not-configured");

  const now = new Date();
  const { data: settingsRows, error } = await admin
    .from("elan_settings")
    .select(
      "user_id, name, notify_time, notify_timezone, notify_last_sent",
    )
    .eq("notify_enabled", true);

  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const raw of (settingsRows ?? []) as SettingsCronRow[]) {
    const tz = raw.notify_timezone || "Europe/Paris";
    const time = raw.notify_time || "09:00";

    if (!isNotifyTimeNow(time, tz, now)) {
      skipped++;
      continue;
    }

    const todayKey = dateKeyInTimezone(tz, now);
    if (raw.notify_last_sent === todayKey) {
      skipped++;
      continue;
    }

    const uid = raw.user_id;

    const [threadsRes, sessionsRes, subsRes] = await Promise.all([
      admin.from("elan_threads").select("*").eq("user_id", uid),
      admin
        .from("elan_sessions")
        .select("*")
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .limit(60),
      admin.from("elan_push_subscriptions").select("*").eq("user_id", uid),
    ]);

    if (threadsRes.error || sessionsRes.error || subsRes.error) {
      errors++;
      continue;
    }

    const threads = ((threadsRes.data ?? []) as ThreadRow[]).map(mapThread);
    const sessions = ((sessionsRes.data ?? []) as SessionRow[]).map(
      mapSession,
    );
    const subs = (subsRes.data ?? []) as (PushSubscriptionRow & {
      id: string;
    })[];

    if (subs.length === 0) {
      skipped++;
      continue;
    }

    if (hadSessionToday(sessions, tz, now)) {
      skipped++;
      continue;
    }

    const stats: PlanStatsForNotify = computePlanStats(
      threads,
      sessions,
      dayStartMsInTimezone(tz, now),
    );
    const plan = await generatePlanViaApi({
      threads,
      stats,
      meta: { name: raw.name ?? undefined },
    });

    const open = threads.filter((t) => t.status === "open");
    const minutes = plan?.pick ? Number(plan.pick) : 15;
    const payload = buildRitualNotification({
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 15,
      planMessage: plan?.message ?? "",
      openCount: open.length,
    });

    let delivered = false;
    for (const sub of subs) {
      try {
        await sendWebPush(sub, payload);
        delivered = true;
      } catch (e) {
        if (isPushSubscriptionGone(e)) {
          await admin
            .from("elan_push_subscriptions")
            .delete()
            .eq("id", sub.id);
        } else {
          console.error("[cron/ritual] push failed:", e);
          errors++;
        }
      }
    }

    if (delivered) {
      await admin
        .from("elan_settings")
        .update({ notify_last_sent: todayKey, updated_at: now.toISOString() })
        .eq("user_id", uid);
      sent++;
    }
  }

  return { sent, skipped, errors };
}
