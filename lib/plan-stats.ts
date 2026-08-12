import type { PlanStatsForNotify } from "./notifications";
import type { SessionLog, Thread } from "./types";
import { completionAt } from "./week-stats";

/** Stats passées à /api/plan — même logique que l'accueil. */
export function computePlanStats(
  threads: Thread[],
  sessions: SessionLog[],
  dayStartMs: number,
): PlanStatsForNotify {
  const openThreads = threads.filter((t) => t.status === "open");
  const since = dayStartMs - 6 * 86_400_000;
  const recent = sessions.filter((s) => Date.parse(s.date) >= since);
  const lastSession = sessions.reduce<number | null>((acc, s) => {
    const ts = Date.parse(s.date);
    if (!Number.isFinite(ts)) return acc;
    return acc === null || ts > acc ? ts : acc;
  }, null);
  return {
    addedLast7: threads.filter((t) => Date.parse(t.createdAt) >= since).length,
    doneLast7: threads.filter(
      (t) =>
        t.status === "done" &&
        completionAt(t) &&
        Date.parse(completionAt(t)!) >= since,
    ).length,
    sessionsLast7: recent.length,
    minutesLast7: recent.reduce((a, s) => a + (s.durationMin || 0), 0),
    daysSinceLastSession:
      lastSession === null
        ? null
        : Math.max(0, Math.round((dayStartMs - lastSession) / 86_400_000)),
    stale14: openThreads.filter(
      (t) => Date.parse(t.createdAt) < dayStartMs - 14 * 86_400_000,
    ).length,
  };
}
