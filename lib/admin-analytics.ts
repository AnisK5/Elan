import type { ChatMessage } from "./types";

export interface RawApiUsageRow {
  userId: string | null;
  at: string;
  day: string;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  sessionId: string | null;
  sessionContext: string | null;
  exchangeIndex: number | null;
  exchangeKind: string | null;
}

export interface RawAnalyticsSession {
  userId: string;
  id: string;
  date: string;
  durationMin: number;
  context: string | null;
  transcript: ChatMessage[];
}

export interface TokenDayRow {
  day: string;
  input: number;
  output: number;
  total: number;
}

export interface RouteTokenRow {
  route: string;
  input: number;
  output: number;
  calls: number;
}

export interface UserTokenRow {
  userId: string;
  email: string;
  name?: string;
  input: number;
  output: number;
  total: number;
  sessions: number;
}

export interface HourRow {
  hour: number;
  count: number;
  avgMin: number;
}

export interface BucketRow {
  label: string;
  count: number;
}

export interface DropoffRow {
  turns: number;
  label: string;
  count: number;
}

export interface ExchangeKindRow {
  kind: string;
  count: number;
  tokens: number;
}

export interface ContextRow {
  context: string;
  sessions: number;
  avgMin: number;
  avgTurns: number;
  tokens: number;
}

export interface SessionInsightRow {
  id: string;
  date: string;
  durationMin: number;
  context: string;
  userTurns: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AdminAnalyticsSnapshot {
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    apiCalls: number;
    sessions: number;
    avgSessionMin: number;
    avgTurnsPerSession: number;
    avgTokensPerSession: number;
  };
  tokensByDay: TokenDayRow[];
  tokensByRoute: RouteTokenRow[];
  tokensByUser: UserTokenRow[];
  sessionsByHour: HourRow[];
  durationBuckets: BucketRow[];
  dropoffTurns: DropoffRow[];
  exchangeKinds: ExchangeKindRow[];
  contextBreakdown: ContextRow[];
  recentSessions: SessionInsightRow[];
}

const CONTEXT_LABELS: Record<string, string> = {
  desk: "Bureau",
  sortie: "Sortie",
  courses: "Courses",
  regulier: "Réguliers",
  deposer: "Déposer",
};

function parisHour(iso: string): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number.parseInt(h, 10);
}

export function countUserTurns(transcript: ChatMessage[]): number {
  return transcript.filter((m) => m.role === "user" && m.content.trim()).length;
}

function durationLabel(min: number): string {
  if (min <= 5) return "≤ 5 min";
  if (min <= 15) return "6–15 min";
  if (min <= 30) return "16–30 min";
  return "31+ min";
}

function dropoffLabel(turns: number): string {
  if (turns >= 5) return "5+ échanges";
  return `${turns} échange${turns > 1 ? "s" : ""}`;
}

export function buildAdminAnalytics(
  usage: RawApiUsageRow[],
  sessions: RawAnalyticsSession[],
  userEmails: Map<string, string>,
  userNames: Map<string, string>,
  filterUserId?: string,
): AdminAnalyticsSnapshot {
  const usageRows = filterUserId
    ? usage.filter((u) => u.userId === filterUserId)
    : usage;
  const sessionRows = filterUserId
    ? sessions.filter((s) => s.userId === filterUserId)
    : sessions;

  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of usageRows) {
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
  }

  const byDay = new Map<string, { input: number; output: number }>();
  for (const u of usageRows) {
    const cur = byDay.get(u.day) ?? { input: 0, output: 0 };
    cur.input += u.inputTokens;
    cur.output += u.outputTokens;
    byDay.set(u.day, cur);
  }
  const tokensByDay = [...byDay.entries()]
    .map(([day, v]) => ({
      day,
      input: v.input,
      output: v.output,
      total: v.input + v.output,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);

  const byRoute = new Map<string, RouteTokenRow>();
  for (const u of usageRows) {
    const cur = byRoute.get(u.route) ?? {
      route: u.route,
      input: 0,
      output: 0,
      calls: 0,
    };
    cur.input += u.inputTokens;
    cur.output += u.outputTokens;
    cur.calls += 1;
    byRoute.set(u.route, cur);
  }
  const tokensByRoute = [...byRoute.values()].sort(
    (a, b) => b.input + b.output - (a.input + a.output),
  );

  const tokensBySession = new Map<string, { input: number; output: number }>();
  for (const u of usageRows) {
    if (!u.sessionId) continue;
    const cur = tokensBySession.get(u.sessionId) ?? { input: 0, output: 0 };
    cur.input += u.inputTokens;
    cur.output += u.outputTokens;
    tokensBySession.set(u.sessionId, cur);
  }

  const byUser = new Map<string, UserTokenRow>();
  for (const u of usageRows) {
    if (!u.userId) continue;
    const cur = byUser.get(u.userId) ?? {
      userId: u.userId,
      email: userEmails.get(u.userId) ?? "",
      name: userNames.get(u.userId),
      input: 0,
      output: 0,
      total: 0,
      sessions: 0,
    };
    cur.input += u.inputTokens;
    cur.output += u.outputTokens;
    cur.total = cur.input + cur.output;
    byUser.set(u.userId, cur);
  }
  const sessionsByUser = new Map<string, number>();
  for (const s of sessionRows) {
    sessionsByUser.set(s.userId, (sessionsByUser.get(s.userId) ?? 0) + 1);
  }
  for (const [uid, n] of sessionsByUser) {
    const cur = byUser.get(uid);
    if (cur) cur.sessions = n;
  }
  const tokensByUser = [...byUser.values()].sort((a, b) => b.total - a.total);

  const hourMap = new Map<number, { count: number; totalMin: number }>();
  for (const s of sessionRows) {
    const h = parisHour(s.date);
    const cur = hourMap.get(h) ?? { count: 0, totalMin: 0 };
    cur.count += 1;
    cur.totalMin += s.durationMin;
    hourMap.set(h, cur);
  }
  const sessionsByHour: HourRow[] = [];
  for (let h = 0; h < 24; h++) {
    const cur = hourMap.get(h);
    sessionsByHour.push({
      hour: h,
      count: cur?.count ?? 0,
      avgMin: cur && cur.count > 0 ? Math.round(cur.totalMin / cur.count) : 0,
    });
  }

  const durBuckets = new Map<string, number>();
  for (const s of sessionRows) {
    const label = durationLabel(s.durationMin);
    durBuckets.set(label, (durBuckets.get(label) ?? 0) + 1);
  }
  const durationBuckets = ["≤ 5 min", "6–15 min", "16–30 min", "31+ min"].map(
    (label) => ({ label, count: durBuckets.get(label) ?? 0 }),
  );

  const dropMap = new Map<number, number>();
  let totalTurns = 0;
  for (const s of sessionRows) {
    const turns = countUserTurns(s.transcript);
    totalTurns += turns;
    const bucket = turns >= 5 ? 5 : Math.max(turns, 1);
    dropMap.set(bucket, (dropMap.get(bucket) ?? 0) + 1);
  }
  const dropoffTurns = [1, 2, 3, 4, 5].map((turns) => ({
    turns,
    label: dropoffLabel(turns),
    count: dropMap.get(turns) ?? 0,
  }));

  const kindMap = new Map<string, ExchangeKindRow>();
  for (const u of usageRows) {
    const kind = u.exchangeKind ?? u.route;
    const cur = kindMap.get(kind) ?? { kind, count: 0, tokens: 0 };
    cur.count += 1;
    cur.tokens += u.inputTokens + u.outputTokens;
    kindMap.set(kind, cur);
  }
  const exchangeKinds = [...kindMap.values()].sort((a, b) => b.tokens - a.tokens);

  const ctxMap = new Map<string, ContextRow>();
  for (const s of sessionRows) {
    const ctx = s.context ?? "desk";
    const cur = ctxMap.get(ctx) ?? {
      context: CONTEXT_LABELS[ctx] ?? ctx,
      sessions: 0,
      avgMin: 0,
      avgTurns: 0,
      tokens: 0,
    };
    cur.sessions += 1;
    cur.avgMin += s.durationMin;
    cur.avgTurns += countUserTurns(s.transcript);
    const tok = tokensBySession.get(s.id);
    cur.tokens += tok ? tok.input + tok.output : 0;
    ctxMap.set(ctx, cur);
  }
  const contextBreakdown = [...ctxMap.values()].map((c) => ({
    ...c,
    avgMin: c.sessions > 0 ? Math.round(c.avgMin / c.sessions) : 0,
    avgTurns:
      c.sessions > 0
        ? Math.round((c.avgTurns / c.sessions) * 10) / 10
        : 0,
  }));

  const recentSessions: SessionInsightRow[] = sessionRows
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15)
    .map((s) => {
      const tok = tokensBySession.get(s.id) ?? { input: 0, output: 0 };
      return {
        id: s.id,
        date: s.date,
        durationMin: s.durationMin,
        context: CONTEXT_LABELS[s.context ?? "desk"] ?? s.context ?? "—",
        userTurns: countUserTurns(s.transcript),
        messages: s.transcript.length,
        inputTokens: tok.input,
        outputTokens: tok.output,
      };
    });

  const sessionCount = sessionRows.length;
  const totalSessionMin = sessionRows.reduce((a, s) => a + s.durationMin, 0);

  return {
    totals: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      apiCalls: usageRows.length,
      sessions: sessionCount,
      avgSessionMin:
        sessionCount > 0 ? Math.round(totalSessionMin / sessionCount) : 0,
      avgTurnsPerSession:
        sessionCount > 0
          ? Math.round((totalTurns / sessionCount) * 10) / 10
          : 0,
      avgTokensPerSession:
        sessionCount > 0
          ? Math.round((inputTokens + outputTokens) / sessionCount)
          : 0,
    },
    tokensByDay,
    tokensByRoute,
    tokensByUser,
    sessionsByHour,
    durationBuckets,
    dropoffTurns,
    exchangeKinds,
    contextBreakdown,
    recentSessions,
  };
}
