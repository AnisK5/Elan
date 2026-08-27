import type { SessionLog, Thread } from "./types";
import { doneCountsThisWeek } from "./week-stats";

export type UsageKind =
  | "open"
  | "session"
  | "aside"
  | "dwell"
  | "signup"
  | "notify_on"
  | "ritual"
  | "capture"
  | "thread_done"
  | "feedback";

export interface UsageEvent {
  id: string;
  kind: UsageKind;
  at: string;
  /** Jour calendaire local, YYYY-MM-DD. */
  day: string;
  durationSec?: number;
  meta?: Record<string, unknown>;
}

export interface UsageWeek {
  days: boolean[];
  todayIdx: number;
  passages: number;
  sessions: number;
  minutes: number;
  doneToday: number;
  doneWeek: number;
  doneDays: number[];
}

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOf(dayStartMs: number): Date {
  const start = new Date(dayStartMs);
  start.setHours(0, 0, 0, 0);
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function dayOffset(isoOrDay: string, monday: Date): number | null {
  const ts = isoOrDay.length <= 10
    ? Date.parse(`${isoOrDay}T12:00:00`)
    : Date.parse(isoOrDay);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - monday.getTime()) / 86_400_000);
  if (diff < 0 || diff > 6) return null;
  return diff;
}

/** Un passage = une séance ou une info glissée — pas juste ouvrir l'app. */
export function isPassageKind(kind: UsageKind): boolean {
  return kind === "session" || kind === "aside";
}

export function computeUsageWeek(
  events: UsageEvent[],
  sessions: SessionLog[],
  threads: Thread[],
  dayStartMs: number,
): UsageWeek {
  const monday = mondayOf(dayStartMs);
  const start = new Date(dayStartMs);
  start.setHours(0, 0, 0, 0);
  const todayIdx = (start.getDay() + 6) % 7;
  const days = Array(7).fill(false) as boolean[];
  let sessionsN = 0;
  let minutes = 0;

  const weekSessionEvents: UsageEvent[] = [];
  for (const e of events) {
    const i = dayOffset(e.day || e.at, monday);
    if (i === null) continue;
    if (isPassageKind(e.kind)) days[i] = true;
    if (e.kind === "session") weekSessionEvents.push(e);
  }

  if (weekSessionEvents.length > 0) {
    sessionsN = weekSessionEvents.length;
    minutes = weekSessionEvents.reduce(
      (a, e) => a + Math.round((e.durationSec ?? 0) / 60),
      0,
    );
  }

  for (const s of sessions) {
    const i = dayOffset(s.date, monday);
    if (i === null) continue;
    days[i] = true;
    if (weekSessionEvents.length === 0) {
      sessionsN += 1;
      minutes += s.durationMin || 0;
    }
  }

  const done = doneCountsThisWeek(threads, dayStartMs);
  return {
    days,
    todayIdx,
    passages: days.filter(Boolean).length,
    sessions: sessionsN,
    minutes,
    doneToday: done.doneToday,
    doneWeek: done.doneWeek,
    doneDays: done.days,
  };
}

export function consecutivePassageDays(
  events: UsageEvent[],
  sessions: SessionLog[],
  from: Date = new Date(),
): number {
  const passed = new Set<string>();
  for (const e of events) {
    if (isPassageKind(e.kind)) passed.add(e.day || dayKey(new Date(e.at)));
  }
  for (const s of sessions) {
    passed.add(dayKey(new Date(s.date)));
  }
  let n = 0;
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (passed.has(dayKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
