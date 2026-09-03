import type { RawApiUsageRow } from "./admin-analytics";
import { estimateUsageCostEur } from "./anthropic-pricing";
import { DEFAULT_PLAN_CALLS_PER_HOUR } from "./app-config";
import { fillHourKeys } from "./chart-series";

export interface AdminUsageFilters {
  days: number;
  userId?: string;
  route?: string;
  model?: string;
  day?: string;
}

export interface HourlyUsageRow {
  hourKey: string;
  hourLabel: string;
  calls: number;
  input: number;
  output: number;
  total: number;
  costEur: number;
  byRoute: Record<string, number>;
}

export interface HourlyRouteRow {
  hourKey: string;
  hourLabel: string;
  route: string;
  calls: number;
  total: number;
  costEur: number;
}

export interface ApiCallLogRow {
  at: string;
  route: string;
  model: string;
  userId: string | null;
  userLabel: string;
  inputTokens: number;
  outputTokens: number;
  total: number;
  costEur: number;
  exchangeKind: string | null;
}

export interface PlanRateHourRow {
  hourKey: string;
  hourLabel: string;
  userId: string | null;
  userLabel: string;
  planCalls: number;
  overLimit: boolean;
}

export interface UsageAnomaly {
  kind: "plan_burst" | "cost_spike";
  hourKey: string;
  hourLabel: string;
  detail: string;
  planCalls?: number;
  costEur?: number;
}

export interface RateLimitNowRow {
  userId: string | null;
  userLabel: string;
  planCallsLastHour: number;
  overLimit: boolean;
}

export interface UsageMonitorSnapshot {
  planCallsPerHourLimit: number;
  hourly: HourlyUsageRow[];
  hourlyByRoute: HourlyRouteRow[];
  apiJournal: ApiCallLogRow[];
  planRateByHour: PlanRateHourRow[];
  anomalies: UsageAnomaly[];
  rateLimitNow: RateLimitNowRow[];
  availableRoutes: string[];
  availableModels: string[];
}

function parisParts(iso: string): {
  y: string;
  m: string;
  d: string;
  h: string;
} {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    y: pick("year"),
    m: pick("month"),
    d: pick("day"),
    h: pick("hour"),
  };
}

export function parisHourKey(iso: string): string {
  const { y, m, d, h } = parisParts(iso);
  return `${y}-${m}-${d}T${h}`;
}

function parisHourLabel(hourKey: string): string {
  const [date, hour] = hourKey.split("T");
  const [y, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)} ${hour}h`;
}

function userLabel(
  userId: string | null,
  userEmails: Map<string, string>,
  userNames: Map<string, string>,
): string {
  if (!userId) return "cron / anon";
  return userNames.get(userId) || userEmails.get(userId) || userId.slice(0, 8);
}

function rowCost(u: RawApiUsageRow): number {
  return estimateUsageCostEur(u.model, u.inputTokens, u.outputTokens);
}

export function buildUsageMonitor(
  usage: RawApiUsageRow[],
  userEmails: Map<string, string>,
  userNames: Map<string, string>,
  planCallsPerHourLimit = DEFAULT_PLAN_CALLS_PER_HOUR,
): UsageMonitorSnapshot {
  const routes = new Set<string>();
  const models = new Set<string>();
  for (const u of usage) {
    routes.add(u.route);
    models.add(u.model);
  }

  const hourMap = new Map<
    string,
    HourlyUsageRow & { routeCounts: Map<string, number> }
  >();
  const hourRouteMap = new Map<string, HourlyRouteRow>();
  const planHourUser = new Map<string, PlanRateHourRow>();

  for (const u of usage) {
    const hourKey = parisHourKey(u.at);
    const hourLabel = parisHourLabel(hourKey);
    const cost = rowCost(u);
    const total = u.inputTokens + u.outputTokens;

    const h =
      hourMap.get(hourKey) ??
      ({
        hourKey,
        hourLabel,
        calls: 0,
        input: 0,
        output: 0,
        total: 0,
        costEur: 0,
        byRoute: {},
        routeCounts: new Map<string, number>(),
      } as HourlyUsageRow & { routeCounts: Map<string, number> });
    h.calls += 1;
    h.input += u.inputTokens;
    h.output += u.outputTokens;
    h.total += total;
    h.costEur += cost;
    h.routeCounts.set(u.route, (h.routeCounts.get(u.route) ?? 0) + 1);
    hourMap.set(hourKey, h);

    const hrKey = `${hourKey}|${u.route}`;
    const hr =
      hourRouteMap.get(hrKey) ??
      ({
        hourKey,
        hourLabel,
        route: u.route,
        calls: 0,
        total: 0,
        costEur: 0,
      } satisfies HourlyRouteRow);
    hr.calls += 1;
    hr.total += total;
    hr.costEur += cost;
    hourRouteMap.set(hrKey, hr);

    if (u.route === "plan") {
      const puKey = `${hourKey}|${u.userId ?? "null"}`;
      const label = userLabel(u.userId, userEmails, userNames);
      const pu =
        planHourUser.get(puKey) ??
        ({
          hourKey,
          hourLabel,
          userId: u.userId,
          userLabel: label,
          planCalls: 0,
          overLimit: false,
        } satisfies PlanRateHourRow);
      pu.planCalls += 1;
      pu.overLimit =
        planCallsPerHourLimit > 0 && pu.planCalls > planCallsPerHourLimit;
      planHourUser.set(puKey, pu);
    }
  }

  const hourlyRaw = [...hourMap.values()]
    .map((h) => {
      const byRoute: Record<string, number> = {};
      for (const [route, n] of h.routeCounts) byRoute[route] = n;
      const { routeCounts: _, ...row } = h;
      return { ...row, byRoute };
    })
    .sort((a, b) => a.hourKey.localeCompare(b.hourKey));

  const hourValueMap = new Map(
    hourlyRaw.map((h) => [
      h.hourKey,
      { calls: h.calls, total: h.total, costEur: h.costEur },
    ]),
  );
  const filledHours = fillHourKeys(
    hourlyRaw.map((h) => h.hourKey),
    hourValueMap,
  );
  const byRouteKeep = new Map(hourlyRaw.map((h) => [h.hourKey, h.byRoute]));
  const hourly: HourlyUsageRow[] = filledHours.map((f) => {
    const raw = hourMap.get(f.hourKey);
    return {
      hourKey: f.hourKey,
      hourLabel: f.hourLabel,
      calls: f.calls,
      input: raw?.input ?? 0,
      output: raw?.output ?? 0,
      total: f.total,
      costEur: f.costEur,
      byRoute: byRouteKeep.get(f.hourKey) ?? {},
    };
  });

  const hourlyByRoute = [...hourRouteMap.values()].sort((a, b) =>
    a.hourKey === b.hourKey
      ? a.route.localeCompare(b.route)
      : a.hourKey.localeCompare(b.hourKey),
  );

  const planRateByHour = [...planHourUser.values()]
    .filter((r) => r.overLimit)
    .sort((a, b) => b.hourKey.localeCompare(a.hourKey));

  const anomalies: UsageAnomaly[] = [];
  for (const h of hourly) {
    const planCalls = h.byRoute.plan ?? 0;
    if (planCallsPerHourLimit > 0 && planCalls > planCallsPerHourLimit) {
      anomalies.push({
        kind: "plan_burst",
        hourKey: h.hourKey,
        hourLabel: h.hourLabel,
        detail: `${planCalls} appels plan (plafond ${planCallsPerHourLimit}/h)`,
        planCalls,
        costEur: h.costEur,
      });
    }
    if (h.costEur >= 2) {
      anomalies.push({
        kind: "cost_spike",
        hourKey: h.hourKey,
        hourLabel: h.hourLabel,
        detail: `~${h.costEur.toFixed(2)} € estimés en une heure`,
        costEur: h.costEur,
      });
    }
  }

  const sinceMs = Date.now() - 3_600_000;
  const rateMap = new Map<string, RateLimitNowRow>();
  for (const u of usage) {
    if (u.route !== "plan") continue;
    if (Date.parse(u.at) < sinceMs) continue;
    const uid = u.userId;
    const key = uid ?? "null";
    const label = userLabel(uid, userEmails, userNames);
    const cur =
      rateMap.get(key) ??
      ({
        userId: uid,
        userLabel: label,
        planCallsLastHour: 0,
        overLimit: false,
      } satisfies RateLimitNowRow);
    cur.planCallsLastHour += 1;
    cur.overLimit =
      planCallsPerHourLimit > 0 &&
      cur.planCallsLastHour >= planCallsPerHourLimit;
    rateMap.set(key, cur);
  }

  const apiJournal: ApiCallLogRow[] = usage
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 200)
    .map((u) => ({
      at: u.at,
      route: u.route,
      model: u.model,
      userId: u.userId,
      userLabel: userLabel(u.userId, userEmails, userNames),
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      total: u.inputTokens + u.outputTokens,
      costEur: rowCost(u),
      exchangeKind: u.exchangeKind,
    }));

  return {
    planCallsPerHourLimit,
    hourly,
    hourlyByRoute,
    apiJournal,
    planRateByHour,
    anomalies: anomalies.sort((a, b) => b.hourKey.localeCompare(a.hourKey)),
    rateLimitNow: [...rateMap.values()].sort(
      (a, b) => b.planCallsLastHour - a.planCallsLastHour,
    ),
    availableRoutes: [...routes].sort(),
    availableModels: [...models].sort(),
  };
}
