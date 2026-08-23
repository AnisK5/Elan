/** Agrégats levée / rétention — pas de contenu de trucs ni de transcripts. */

export interface AdminUserRow {
  id: string;
  email: string;
  name?: string;
  signedUp: string;
  lastSeen: string | null;
  daysActive30: number;
  sessions: number;
  sessionMinutes: number;
  dwellMinutes: number;
  streak: number;
  longestStreak: number;
  done30: number;
  activated: boolean;
}

export interface AdminTotals {
  signups: number;
  signups7: number;
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  activatedPct: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  sessionsPerActive7: number;
  avgSessionMin: number;
  dwellPerActive7: number;
}

export interface AdminSnapshot {
  totals: AdminTotals;
  users: AdminUserRow[];
}

export interface AdminRawUser {
  id: string;
  email: string;
  createdAt: string;
  name?: string;
}

export interface AdminRawEvent {
  userId: string;
  kind: string;
  at: string;
  day: string;
  durationSec?: number;
}

export interface AdminRawSession {
  userId: string;
  date: string;
  durationMin: number;
}

export interface AdminRawDone {
  userId: string;
  at: string;
}

function utcDay(iso: string): string {
  if (iso.length <= 10) return iso;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function activityDays(userId: string, events: AdminRawEvent[], sessions: AdminRawSession[]): Set<string> {
  const days = new Set<string>();
  for (const e of events) {
    if (e.userId !== userId) continue;
    days.add(e.day || utcDay(e.at));
  }
  for (const s of sessions) {
    if (s.userId !== userId) continue;
    days.add(utcDay(s.date));
  }
  return days;
}

function streakFrom(days: Set<string>, from: string): number {
  let n = 0;
  let d = from;
  while (days.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

function longestStreak(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function retention(
  users: AdminRawUser[],
  days: Map<string, Set<string>>,
  lag: number,
  today: string,
): number | null {
  const eligible = users.filter(
    (u) => daysBetween(utcDay(u.createdAt), today) >= lag,
  );
  if (eligible.length < 3) return null;
  let back = 0;
  for (const u of eligible) {
    const start = utcDay(u.createdAt);
    const target = addDays(start, lag);
    if (days.get(u.id)?.has(target)) back += 1;
  }
  return Math.round((back / eligible.length) * 100);
}

export function buildAdminSnapshot(
  users: AdminRawUser[],
  events: AdminRawEvent[],
  sessions: AdminRawSession[],
  dones: AdminRawDone[],
  now: Date = new Date(),
): AdminSnapshot {
  const today = now.toISOString().slice(0, 10);
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);
  const since7 = Date.parse(`${d7}T00:00:00Z`);
  const since30 = Date.parse(`${d30}T00:00:00Z`);
  const signup7 = addDays(today, -6);

  const daysByUser = new Map<string, Set<string>>();
  for (const u of users) {
    daysByUser.set(u.id, activityDays(u.id, events, sessions));
  }

  const activeOn = (from: string) => {
    const ids = new Set<string>();
    for (const [id, days] of daysByUser) {
      for (const d of days) {
        if (d >= from && d <= today) ids.add(id);
      }
    }
    return ids;
  };

  const dau = [...(daysByUser.values())].filter((d) => d.has(today)).length;
  const wau = activeOn(d7).size;
  const mau = activeOn(d30).size;

  let sessions7 = 0;
  let sessionMinAll = 0;
  let sessionN = 0;
  for (const s of sessions) {
    sessionN += 1;
    sessionMinAll += s.durationMin || 0;
    if (Date.parse(s.date) >= since7) sessions7 += 1;
  }

  let dwell7 = 0;
  for (const e of events) {
    if (e.kind !== "dwell") continue;
    if (Date.parse(e.at) >= since7 || (e.day && e.day >= d7)) {
      dwell7 += e.durationSec ?? 0;
    }
  }

  const activated = users.filter((u) =>
    sessions.some((s) => s.userId === u.id),
  ).length;

  const rows: AdminUserRow[] = users
    .map((u) => {
      const days = daysByUser.get(u.id) ?? new Set();
      const last = [...days].sort().at(-1) ?? null;
      const sess = sessions.filter((s) => s.userId === u.id);
      const dwell = events
        .filter((e) => e.userId === u.id && e.kind === "dwell")
        .reduce((a, e) => a + (e.durationSec ?? 0), 0);
      const done30 = dones.filter(
        (d) => d.userId === u.id && Date.parse(d.at) >= since30,
      ).length;
      const active30 = [...days].filter((d) => d >= d30).length;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        signedUp: u.createdAt,
        lastSeen: last,
        daysActive30: active30,
        sessions: sess.length,
        sessionMinutes: sess.reduce((a, s) => a + (s.durationMin || 0), 0),
        dwellMinutes: Math.round(dwell / 60),
        streak: streakFrom(days, today),
        longestStreak: longestStreak(days),
        done30,
        activated: sess.length > 0,
      };
    })
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));

  return {
    totals: {
      signups: users.length,
      signups7: users.filter((u) => utcDay(u.createdAt) >= signup7).length,
      dau,
      wau,
      mau,
      stickiness: mau > 0 ? Math.round((dau / mau) * 100) : 0,
      activatedPct:
        users.length > 0 ? Math.round((activated / users.length) * 100) : 0,
      d1: retention(users, daysByUser, 1, today),
      d7: retention(users, daysByUser, 7, today),
      d30: retention(users, daysByUser, 30, today),
      sessionsPerActive7: wau > 0 ? Math.round((sessions7 / wau) * 10) / 10 : 0,
      avgSessionMin:
        sessionN > 0 ? Math.round((sessionMinAll / sessionN) * 10) / 10 : 0,
      dwellPerActive7: wau > 0 ? Math.round(dwell7 / 60 / wau) : 0,
    },
    users: rows,
  };
}
