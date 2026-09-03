/**
 * Dashboard produit — usage, temps, rétention, acquisition, churn, frictions.
 * Séries temporelles continues (jour ou heure Paris).
 */

import {
  ACQUISITION_CHANNELS,
  type AcquisitionInfo,
} from "./acquisition";
import {
  listParisHourKeys,
  listUtcDays,
  parisHourLabelFromKey,
} from "./chart-series";
import type {
  AdminRawEvent,
  AdminRawSession,
  AdminRawUser,
  AdminTotals,
} from "./admin-stats";
import { buildAdminSnapshot } from "./admin-stats";

export type ProductGranularity = "day" | "hour";
export type ProductTab =
  | "overview"
  | "engagement"
  | "retention"
  | "acquisition"
  | "friction";

export interface ProductFilters {
  days: number;
  granularity: ProductGranularity;
  userId?: string | null;
  tab: ProductTab;
}

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

export interface CategoryPoint {
  label: string;
  value: number;
}

export interface CohortRow {
  week: string;
  label: string;
  size: number;
  d1: number | null;
  d7: number | null;
  d14: number | null;
}

export interface DormantUser {
  userId: string;
  email: string;
  name?: string;
  lastSeen: string | null;
  daysSince: number;
  sessions: number;
}

export interface FrictionEvent {
  at: string;
  label: string;
  detail: string;
  userId: string | null;
  userLabel: string;
  kind: "plan_block" | "latency" | "stop" | "alert";
}

export interface RawApiFrictionRow {
  userId: string | null;
  at: string;
  route: string;
  model: string;
  stopReason: string | null;
  latencyMs: number | null;
}

export interface RawAdminAlert {
  kind: string;
  sentAt: string;
  meta?: Record<string, unknown> | null;
}

export interface ProductKpis extends AdminTotals {
  returning7: number;
  dormant14: number;
  churnRiskPct: number;
  planBlocksPeriod: number;
  highLatencyPeriod: number;
  sessionsPeriod: number;
  sessionMinPeriod: number;
  dwellMinPeriod: number;
  passagesPeriod: number;
}

export interface AdminProductSnapshot {
  filters: ProductFilters;
  kpis: ProductKpis;
  series: {
    activeUsers: SeriesPoint[];
    signups: SeriesPoint[];
    sessions: SeriesPoint[];
    sessionMinutes: SeriesPoint[];
    dwellMinutes: SeriesPoint[];
    passages: SeriesPoint[];
    returningUsers: SeriesPoint[];
    planBlocks: SeriesPoint[];
    highLatency: SeriesPoint[];
    stopAnomalies: SeriesPoint[];
  };
  acquisition: CategoryPoint[];
  funnel: CategoryPoint[];
  cohorts: CohortRow[];
  dormant: DormantUser[];
  frictionJournal: FrictionEvent[];
  users: { userId: string; email: string; name?: string }[];
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
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) /
      86_400_000,
  );
}

function parisBucket(iso: string, granularity: ProductGranularity): string {
  if (granularity === "day") return utcDay(iso);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}`;
}

function fmtDayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function bucketLabel(key: string, granularity: ProductGranularity): string {
  return granularity === "hour" ? parisHourLabelFromKey(key) : fmtDayLabel(key);
}

function emptySeries(
  keys: string[],
  granularity: ProductGranularity,
): SeriesPoint[] {
  return keys.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: 0,
  }));
}

function fillSeries(
  keys: string[],
  granularity: ProductGranularity,
  values: Map<string, number>,
): SeriesPoint[] {
  return keys.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: values.get(key) ?? 0,
  }));
}

function channelLabel(id: string): string {
  return ACQUISITION_CHANNELS.find((c) => c.id === id)?.label ?? id;
}

function acquisitionChannel(info?: AcquisitionInfo | null): string {
  if (info?.survey?.channel) return channelLabel(info.survey.channel);
  const a = info?.attribution;
  if (!a) return "Inconnu";
  if (a.ref) return `ref: ${a.ref}`;
  if (a.source) return a.source;
  if (a.utmSource) return a.utmSource;
  return "Inconnu";
}

function mondayWeek(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function buildAdminProduct(
  users: AdminRawUser[],
  events: AdminRawEvent[],
  sessions: AdminRawSession[],
  acquisitionByUser: Map<string, AcquisitionInfo | null>,
  apiRows: RawApiFrictionRow[],
  alerts: RawAdminAlert[],
  userEmails: Map<string, string>,
  userNames: Map<string, string>,
  filters: ProductFilters,
  planCallsPerHourLimit = 10,
  now: Date = new Date(),
): AdminProductSnapshot {
  const days = Math.min(90, Math.max(1, filters.days));
  const granularity: ProductGranularity =
    filters.granularity === "hour" && days > 7 ? "day" : filters.granularity;
  const filterUserId = filters.userId || undefined;

  const usersF = filterUserId
    ? users.filter((u) => u.id === filterUserId)
    : users;
  const eventsF = filterUserId
    ? events.filter((e) => e.userId === filterUserId)
    : events;
  const sessionsF = filterUserId
    ? sessions.filter((s) => s.userId === filterUserId)
    : sessions;
  const apiF = filterUserId
    ? apiRows.filter((r) => r.userId === filterUserId)
    : apiRows;

  const base = buildAdminSnapshot(
    usersF,
    eventsF,
    sessionsF,
    [],
    [],
    [],
    [],
    [],
    userEmails,
    userNames,
    now,
  );

  const today = now.toISOString().slice(0, 10);
  const periodStart = addDays(today, -(days - 1));
  const keys =
    granularity === "hour"
      ? listParisHourKeys(Math.min(days * 24, 14 * 24), now)
      : listUtcDays(days, now);

  // Activity days per user
  const daysByUser = new Map<string, Set<string>>();
  for (const u of usersF) daysByUser.set(u.id, new Set());
  for (const e of eventsF) {
    const set = daysByUser.get(e.userId) ?? new Set();
    set.add(e.day || utcDay(e.at));
    daysByUser.set(e.userId, set);
  }
  for (const s of sessionsF) {
    const set = daysByUser.get(s.userId) ?? new Set();
    set.add(utcDay(s.date));
    daysByUser.set(s.userId, set);
  }

  // --- series maps ---
  const activeMap = new Map<string, Set<string>>();
  const signupMap = new Map<string, number>();
  const sessionCountMap = new Map<string, number>();
  const sessionMinMap = new Map<string, number>();
  const dwellMap = new Map<string, number>();
  const passageMap = new Map<string, number>();
  const returningMap = new Map<string, Set<string>>();

  for (const key of keys) {
    activeMap.set(key, new Set());
    returningMap.set(key, new Set());
  }

  const signupDayByUser = new Map(
    usersF.map((u) => [u.id, utcDay(u.createdAt)]),
  );

  for (const u of usersF) {
    const day = utcDay(u.createdAt);
    if (day < periodStart || day > today) continue;
    const k = granularity === "day" ? day : parisBucket(u.createdAt, "hour");
    if (keys.includes(k)) {
      signupMap.set(k, (signupMap.get(k) ?? 0) + 1);
    }
  }

  for (const e of eventsF) {
    const day = e.day || utcDay(e.at);
    if (day < periodStart) continue;
    const bucket = parisBucket(e.at, granularity);
    if (!keys.includes(bucket)) continue;
    activeMap.get(bucket)?.add(e.userId);
    if (e.kind === "dwell") {
      dwellMap.set(
        bucket,
        (dwellMap.get(bucket) ?? 0) + (e.durationSec ?? 0) / 60,
      );
    }
    if (e.kind === "session" || e.kind === "aside") {
      passageMap.set(bucket, (passageMap.get(bucket) ?? 0) + 1);
    }
    const signupDay = signupDayByUser.get(e.userId);
    if (signupDay && signupDay < day) {
      returningMap.get(bucket)?.add(e.userId);
    }
  }

  for (const s of sessionsF) {
    const day = utcDay(s.date);
    if (day < periodStart) continue;
    const bucket = parisBucket(s.date, granularity);
    if (!keys.includes(bucket)) continue;
    activeMap.get(bucket)?.add(s.userId);
    sessionCountMap.set(bucket, (sessionCountMap.get(bucket) ?? 0) + 1);
    sessionMinMap.set(
      bucket,
      (sessionMinMap.get(bucket) ?? 0) + (s.durationMin || 0),
    );
    const signupDay = signupDayByUser.get(s.userId);
    if (signupDay && signupDay < day) {
      returningMap.get(bucket)?.add(s.userId);
    }
  }

  // Friction series from API
  const planBlockMap = new Map<string, number>();
  const latencyMap = new Map<string, number>();
  const stopMap = new Map<string, number>();
  const planHourUser = new Map<string, number>(); // hourKey|userId -> count
  const frictionJournal: FrictionEvent[] = [];

  for (const r of apiF) {
    const bucket = parisBucket(r.at, granularity);
    if (!keys.includes(bucket) && utcDay(r.at) < periodStart) continue;

    if (r.route === "plan") {
      const hourKey = parisBucket(r.at, "hour");
      const uid = r.userId ?? "null";
      const pk = `${hourKey}|${uid}`;
      planHourUser.set(pk, (planHourUser.get(pk) ?? 0) + 1);
    }

    if ((r.latencyMs ?? 0) >= 12_000) {
      if (keys.includes(bucket)) {
        latencyMap.set(bucket, (latencyMap.get(bucket) ?? 0) + 1);
      }
      frictionJournal.push({
        at: r.at,
        kind: "latency",
        label: "Latence élevée",
        detail: `${r.route} · ${Math.round((r.latencyMs ?? 0) / 1000)}s · ${r.model}`,
        userId: r.userId,
        userLabel:
          (r.userId && (userNames.get(r.userId) || userEmails.get(r.userId))) ||
          "—",
      });
    }

    if (
      r.stopReason === "max_tokens" ||
      r.stopReason === "error" ||
      r.stopReason === "overloaded_error"
    ) {
      if (keys.includes(bucket)) {
        stopMap.set(bucket, (stopMap.get(bucket) ?? 0) + 1);
      }
      frictionJournal.push({
        at: r.at,
        kind: "stop",
        label: "Arrêt anormal",
        detail: `${r.route} · ${r.stopReason}`,
        userId: r.userId,
        userLabel:
          (r.userId && (userNames.get(r.userId) || userEmails.get(r.userId))) ||
          "—",
      });
    }
  }

  for (const [pk, n] of planHourUser) {
    if (planCallsPerHourLimit <= 0 || n < planCallsPerHourLimit) continue;
    const [hourKey, uid] = pk.split("|");
    const day = hourKey.slice(0, 10);
    if (day < periodStart) continue;
    const bucket =
      granularity === "hour" ? hourKey : day;
    if (keys.includes(bucket)) {
      planBlockMap.set(bucket, (planBlockMap.get(bucket) ?? 0) + 1);
    }
    frictionJournal.push({
      at: `${hourKey}:00:00`,
      kind: "plan_block",
      label: "Plafond plan/heure",
      detail: `${n} appels (limite ${planCallsPerHourLimit}/h)`,
      userId: uid === "null" ? null : uid,
      userLabel:
        uid !== "null"
          ? userNames.get(uid) || userEmails.get(uid) || uid.slice(0, 8)
          : "anon",
    });
  }

  for (const a of alerts) {
    frictionJournal.push({
      at: a.sentAt,
      kind: "alert",
      label: `Alerte ${a.kind}`,
      detail:
        typeof a.meta === "object" && a.meta
          ? JSON.stringify(a.meta).slice(0, 120)
          : "notification admin",
      userId: null,
      userLabel: "système",
    });
  }

  frictionJournal.sort((a, b) => b.at.localeCompare(a.at));

  const activeSeries = keys.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: activeMap.get(key)?.size ?? 0,
  }));
  const returningSeries = keys.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: returningMap.get(key)?.size ?? 0,
  }));

  // Acquisition
  const acqCount = new Map<string, number>();
  for (const u of usersF) {
    const ch = acquisitionChannel(acquisitionByUser.get(u.id));
    acqCount.set(ch, (acqCount.get(ch) ?? 0) + 1);
  }
  const acquisition = [...acqCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Funnel
  const hasOpen = new Set(
    eventsF.filter((e) => e.kind === "open" || e.kind === "signup").map((e) => e.userId),
  );
  const hasPassage = new Set(
    eventsF
      .filter((e) => e.kind === "session" || e.kind === "aside")
      .map((e) => e.userId),
  );
  const hasSession = new Set(sessionsF.map((s) => s.userId));
  const hasDone = new Set(
    eventsF.filter((e) => e.kind === "thread_done").map((e) => e.userId),
  );
  const funnel: CategoryPoint[] = [
    { label: "Inscrits", value: usersF.length },
    { label: "Ouverture", value: hasOpen.size || usersF.length },
    { label: "Passage", value: hasPassage.size },
    { label: "Séance", value: hasSession.size },
    { label: "Action faite", value: hasDone.size },
  ];

  // Cohorts by signup week (last 8 weeks)
  const cohortWeeks = listUtcDays(56, now)
    .map(mondayWeek)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(-8);
  const cohorts: CohortRow[] = cohortWeeks.map((week) => {
    const end = addDays(week, 6);
    const members = usersF.filter((u) => {
      const d = utcDay(u.createdAt);
      return d >= week && d <= end;
    });
    const size = members.length;
    const retAt = (lag: number): number | null => {
      if (size < 2) return null;
      const eligible = members.filter(
        (u) => daysBetween(utcDay(u.createdAt), today) >= lag,
      );
      if (eligible.length < 2) return null;
      let back = 0;
      for (const u of eligible) {
        const target = addDays(utcDay(u.createdAt), lag);
        if (daysByUser.get(u.id)?.has(target)) back += 1;
      }
      return Math.round((back / eligible.length) * 100);
    };
    return {
      week,
      label: fmtDayLabel(week),
      size,
      d1: retAt(1),
      d7: retAt(7),
      d14: retAt(14),
    };
  });

  // Dormant: had activity once, silent ≥14d
  const dormant: DormantUser[] = usersF
    .map((u) => {
      const days = daysByUser.get(u.id) ?? new Set();
      const last = [...days].sort().at(-1) ?? null;
      const sess = sessionsF.filter((s) => s.userId === u.id).length;
      const since = last ? daysBetween(last, today) : daysBetween(utcDay(u.createdAt), today);
      return {
        userId: u.id,
        email: u.email,
        name: u.name ?? userNames.get(u.id),
        lastSeen: last,
        daysSince: since,
        sessions: sess,
      };
    })
    .filter((u) => u.sessions > 0 && u.daysSince >= 14)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 40);

  const d7 = addDays(today, -6);
  const returning7 = new Set<string>();
  for (const [id, daysSet] of daysByUser) {
    const u = usersF.find((x) => x.id === id);
    if (!u) continue;
    if (utcDay(u.createdAt) >= d7) continue;
    for (const d of daysSet) {
      if (d >= d7) {
        returning7.add(id);
        break;
      }
    }
  }

  let sessionsPeriod = 0;
  let sessionMinPeriod = 0;
  for (const s of sessionsF) {
    if (utcDay(s.date) < periodStart) continue;
    sessionsPeriod += 1;
    sessionMinPeriod += s.durationMin || 0;
  }
  let dwellMinPeriod = 0;
  let passagesPeriod = 0;
  for (const e of eventsF) {
    const day = e.day || utcDay(e.at);
    if (day < periodStart) continue;
    if (e.kind === "dwell") dwellMinPeriod += (e.durationSec ?? 0) / 60;
    if (e.kind === "session" || e.kind === "aside") passagesPeriod += 1;
  }

  const planBlocksPeriod = [...planBlockMap.values()].reduce((a, b) => a + b, 0);
  const highLatencyPeriod = [...latencyMap.values()].reduce((a, b) => a + b, 0);
  const activated = usersF.filter((u) =>
    sessionsF.some((s) => s.userId === u.id),
  ).length;
  const churnRiskPct =
    activated > 0
      ? Math.round((dormant.length / activated) * 100)
      : 0;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    filters: {
      days,
      granularity,
      userId: filterUserId ?? null,
      tab: filters.tab,
    },
    kpis: {
      ...base.totals,
      returning7: returning7.size,
      dormant14: dormant.length,
      churnRiskPct,
      planBlocksPeriod,
      highLatencyPeriod,
      sessionsPeriod,
      sessionMinPeriod: round1(sessionMinPeriod),
      dwellMinPeriod: round1(dwellMinPeriod),
      passagesPeriod,
    },
    series: {
      activeUsers: activeSeries,
      signups: fillSeries(keys, granularity, signupMap),
      sessions: fillSeries(keys, granularity, sessionCountMap),
      sessionMinutes: fillSeries(
        keys,
        granularity,
        new Map(
          [...sessionMinMap].map(([k, v]) => [k, round1(v)]),
        ),
      ),
      dwellMinutes: fillSeries(
        keys,
        granularity,
        new Map([...dwellMap].map(([k, v]) => [k, round1(v)])),
      ),
      passages: fillSeries(keys, granularity, passageMap),
      returningUsers: returningSeries,
      planBlocks: keys.length
        ? fillSeries(keys, granularity, planBlockMap)
        : emptySeries(keys, granularity),
      highLatency: fillSeries(keys, granularity, latencyMap),
      stopAnomalies: fillSeries(keys, granularity, stopMap),
    },
    acquisition,
    funnel,
    cohorts,
    dormant,
    frictionJournal: frictionJournal.slice(0, 80),
    users: users
      .map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name ?? userNames.get(u.id),
      }))
      .sort((a, b) =>
        (a.name || a.email).localeCompare(b.name || b.email, "fr"),
      ),
  };
}
