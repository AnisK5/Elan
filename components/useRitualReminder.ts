"use client";

import { useEffect } from "react";
import type { SessionLog, Thread } from "@/lib/types";
import { sessionsToday } from "@/lib/session-memory";
import {
  DEFAULT_NOTIFY_TIME,
  fireRitualNotification,
  isNotifyTimeNow,
  type PlanStatsForNotify,
  wasNotifyFiredToday,
} from "@/lib/notifications";

/** Repli local si pas d'abonnement Web Push (app/PWA ouverte). */
export function useRitualReminder(opts: {
  enabled: boolean;
  notifyTime: string | undefined;
  notifyTimezone: string | undefined;
  ready: boolean;
  view: "home" | "session";
  threads: Thread[];
  sessions: SessionLog[];
  planStats: PlanStatsForNotify;
  name?: string;
}) {
  const {
    enabled,
    notifyTime = DEFAULT_NOTIFY_TIME,
    notifyTimezone,
    ready,
    view,
    threads,
    sessions,
    planStats,
    name,
  } = opts;

  useEffect(() => {
    if (!enabled || !ready || view !== "home") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (sessionsToday(sessions).length > 0) return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) return;
      }
      if (!isNotifyTimeNow(notifyTime, notifyTimezone)) return;
      if (wasNotifyFiredToday()) return;
      await fireRitualNotification({ threads, stats: planStats, name });
    }

    void tick();
    const id = window.setInterval(() => void tick(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    enabled,
    notifyTime,
    notifyTimezone,
    ready,
    view,
    threads,
    sessions,
    planStats,
    name,
  ]);
}
