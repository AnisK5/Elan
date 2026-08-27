import type { ChatMessage, SessionContext } from "./types";
import type { AdminUserRow } from "./admin-stats";
import { countUserTurns } from "./admin-analytics";

export interface AdminThreadFull {
  id: string;
  text: string;
  status: string;
  kind: string;
  createdAt: string;
  doneAt?: string;
  touchedAt?: string;
  note?: string;
  effort?: string;
  due?: string;
}

export interface AdminThreadSample {
  id: string;
  text: string;
  status: string;
  kind: string;
  createdAt: string;
  doneAt?: string;
}

export interface AdminSessionDetail {
  id: string;
  date: string;
  durationMin: number;
  context?: SessionContext;
  messageCount: number;
  userTurns: number;
  inputTokens: number;
  outputTokens: number;
  transcript: ChatMessage[];
  preview: string;
}

export interface AdminFeedbackItem {
  id: string;
  message: string;
  mood: string | null;
  source: string;
  createdAt: string;
}

export interface AdminUsageLogEntry {
  id: string;
  at: string;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  exchangeKind: string | null;
  exchangeIndex: number | null;
  sessionId: string | null;
  sessionContext: string | null;
  stopReason: string | null;
  latencyMs: number | null;
}

export type AdminTimelineKind =
  | "event"
  | "session"
  | "thread_done"
  | "feedback"
  | "api";

export interface AdminTimelineEntry {
  at: string;
  kind: AdminTimelineKind;
  label: string;
  detail?: string;
  weightMin: number;
  eventKind?: string;
  sessionId?: string;
  threadId?: string;
  feedbackId?: string;
  tokens?: number;
  meta?: Record<string, unknown>;
}

export interface AdminDayBand {
  day: string;
  label: string;
  totalWeightMin: number;
  dwellMin: number;
  sessionMin: number;
  discreteCount: number;
  entries: AdminTimelineEntry[];
}

export interface AdminActivityDay {
  day: string;
  weightMin: number;
  active: boolean;
}

export interface AdminUserDetail {
  profile: {
    id: string;
    email: string;
    name?: string;
    signedUp: string;
    situation?: string;
    situationUntil?: string;
    defaultDurationMin: number;
    notifyTimezone: string;
  };
  engagement: AdminUserRow;
  backlog: {
    open: number;
    snoozed: number;
    done: number;
    recent: AdminThreadSample[];
  };
  threads: AdminThreadFull[];
  notifs: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    notifyTime: string;
    hasPushSub: boolean;
  };
  timeline: AdminTimelineEntry[];
  dayBands: AdminDayBand[];
  activityDays: AdminActivityDay[];
  sessions: AdminSessionDetail[];
  feedbacks: AdminFeedbackItem[];
  usageLog: AdminUsageLogEntry[];
  totals: {
    weightMin90: number;
    tokensTotal: number;
    apiCalls: number;
  };
}

export interface AdminRawUserDetailEvent {
  kind: string;
  at: string;
  day: string;
  durationSec?: number;
  meta?: Record<string, unknown>;
}

export interface AdminRawUserDetailSession {
  id: string;
  date: string;
  durationMin: number;
  context?: string;
  transcript: ChatMessage[];
}

export interface AdminRawUserDetailThread {
  id: string;
  text: string;
  kind: string;
  status: string;
  createdAt: string;
  doneAt?: string;
  touchedAt?: string;
  note?: string;
  effort?: string;
  due?: string;
}

export interface AdminRawUserDetailUsage {
  id: string;
  at: string;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  exchangeKind: string | null;
  exchangeIndex: number | null;
  sessionId: string | null;
  sessionContext: string | null;
  stopReason: string | null;
  latencyMs: number | null;
}

export interface AdminRawUserDetailSettings {
  name?: string;
  defaultDurationMin: number;
  notifyEnabled: boolean;
  notifyEmailEnabled: boolean;
  notifyTime: string;
  notifyTimezone: string;
  situation?: string;
  situationUntil?: string;
}

const EVENT_LABELS: Record<string, string> = {
  open: "Ouverture app",
  session: "Séance terminée",
  aside: "Info en passant",
  dwell: "Temps dans l'app",
  signup: "Inscription",
  notify_on: "Notifs activées",
  ritual: "Rituel (notif)",
  capture: "Truc déposé",
  thread_done: "Truc réglé",
  feedback: "Retour envoyé",
};

const ROUTE_LABELS: Record<string, string> = {
  session: "Séance (IA)",
  chat: "Chat accueil",
  plan: "Plan du jour",
  reconcile: "Greffier",
  tidy: "Rangement titre",
};

const DISCRETE_WEIGHT_MIN = 0.35;
const FEEDBACK_WEIGHT_MIN = 0.5;
const DONE_WEIGHT_MIN = 0.4;

function eventLabel(kind: string, meta?: Record<string, unknown>): string {
  const base = EVENT_LABELS[kind] ?? kind;
  if (kind === "notify_on" && meta?.channel) {
    return `${base} (${String(meta.channel)})`;
  }
  if (kind === "capture" && meta?.threadId) {
    return "Truc déposé";
  }
  return base;
}

function eventDetail(
  kind: string,
  durationSec?: number,
  meta?: Record<string, unknown>,
  threadsById?: Map<string, AdminRawUserDetailThread>,
): string | undefined {
  if (kind === "session" || kind === "dwell") {
    const min = Math.round((durationSec ?? 0) / 60);
    if (min > 0) return `${min} min`;
  }
  if (kind === "capture" && meta?.threadId && threadsById) {
    const t = threadsById.get(String(meta.threadId));
    return t?.text.slice(0, 80) ?? String(meta.threadId);
  }
  if (kind === "thread_done" && meta?.threadId && threadsById) {
    const t = threadsById.get(String(meta.threadId));
    return t?.text.slice(0, 80) ?? String(meta.threadId);
  }
  if (kind === "feedback" && meta?.mood) {
    return String(meta.mood);
  }
  return undefined;
}

function eventWeightMin(kind: string, durationSec?: number): number {
  if (kind === "dwell") return Math.max(0.5, (durationSec ?? 0) / 60);
  if (kind === "session") return Math.max(1, (durationSec ?? 0) / 60);
  return DISCRETE_WEIGHT_MIN;
}

const CONTEXT_LABELS: Record<string, string> = {
  desk: "Bureau",
  sortie: "Sortie",
  courses: "Courses",
  regulier: "Réguliers",
  deposer: "Déposer",
};

function fmtDayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function dayKeyFromIso(iso: string): string {
  if (iso.length <= 10) return iso;
  return iso.slice(0, 10);
}

function transcriptPreview(transcript: ChatMessage[]): string {
  const user = transcript.find((m) => m.role === "user" && m.content.trim());
  if (user) return user.content.trim().slice(0, 120);
  const asst = transcript.find((m) => m.role === "assistant" && m.content.trim());
  return asst?.content.trim().slice(0, 120) ?? "—";
}

export function buildDayBands(
  entries: AdminTimelineEntry[],
  now: Date = new Date(),
): { dayBands: AdminDayBand[]; activityDays: AdminActivityDay[] } {
  const byDay = new Map<string, AdminTimelineEntry[]>();
  for (const e of entries) {
    const day = dayKeyFromIso(e.at);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }

  const dayBands: AdminDayBand[] = [...byDay.entries()]
    .map(([day, list]) => {
      const sorted = list.sort((a, b) => b.at.localeCompare(a.at));
      let dwellMin = 0;
      let sessionMin = 0;
      let discreteCount = 0;
      let totalWeightMin = 0;
      for (const e of sorted) {
        totalWeightMin += e.weightMin;
        if (e.eventKind === "dwell") dwellMin += e.weightMin;
        else if (e.kind === "session") sessionMin += e.weightMin;
        else if (e.kind === "event") discreteCount += 1;
      }
      return {
        day,
        label: fmtDayLabel(day),
        totalWeightMin: Math.round(totalWeightMin * 10) / 10,
        dwellMin: Math.round(dwellMin * 10) / 10,
        sessionMin: Math.round(sessionMin * 10) / 10,
        discreteCount,
        entries: sorted,
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));

  const activityDays: AdminActivityDay[] = [];
  const today = now.toISOString().slice(0, 10);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const band = dayBands.find((b) => b.day === day);
    activityDays.push({
      day,
      weightMin: band?.totalWeightMin ?? 0,
      active: (band?.totalWeightMin ?? 0) > 0,
    });
  }

  return { dayBands, activityDays };
}

export function buildAdminUserDetail(
  userId: string,
  email: string,
  signedUp: string,
  settings: AdminRawUserDetailSettings,
  engagement: AdminUserRow,
  threads: AdminRawUserDetailThread[],
  events: AdminRawUserDetailEvent[],
  sessions: AdminRawUserDetailSession[],
  feedbacks: AdminFeedbackItem[],
  usageLog: AdminRawUserDetailUsage[],
  hasPushSub: boolean,
): AdminUserDetail {
  const threadsById = new Map(threads.map((t) => [t.id, t]));
  const open = threads.filter((t) => t.status === "open").length;
  const snoozed = threads.filter((t) => t.status === "snoozed").length;
  const done = threads.filter((t) => t.status === "done").length;

  const recent = [...threads]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      text: t.text,
      status: t.status,
      kind: t.kind,
      createdAt: t.createdAt,
      doneAt: t.doneAt,
    }));

  const tokensBySession = new Map<string, { input: number; output: number }>();
  for (const u of usageLog) {
    if (!u.sessionId) continue;
    const cur = tokensBySession.get(u.sessionId) ?? { input: 0, output: 0 };
    cur.input += u.inputTokens;
    cur.output += u.outputTokens;
    tokensBySession.set(u.sessionId, cur);
  }

  const sessionDetails: AdminSessionDetail[] = sessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => {
      const tok = tokensBySession.get(s.id) ?? { input: 0, output: 0 };
      return {
        id: s.id,
        date: s.date,
        durationMin: s.durationMin,
        context: (s.context as SessionContext | undefined) ?? undefined,
        messageCount: s.transcript.length,
        userTurns: countUserTurns(s.transcript),
        inputTokens: tok.input,
        outputTokens: tok.output,
        transcript: s.transcript,
        preview: transcriptPreview(s.transcript),
      };
    });

  const timeline: AdminTimelineEntry[] = [];

  for (const e of events) {
    if (e.kind === "dwell") {
      const existing = timeline.find(
        (t) => t.eventKind === "dwell" && dayKeyFromIso(t.at) === e.day,
      );
      if (existing) {
        existing.weightMin += (e.durationSec ?? 0) / 60;
        existing.at = e.at;
        if (existing.detail) {
          existing.detail = `${Math.round(existing.weightMin)} min`;
        }
        continue;
      }
    }
    timeline.push({
      at: e.at,
      kind: "event",
      label: eventLabel(e.kind, e.meta),
      detail: eventDetail(e.kind, e.durationSec, e.meta, threadsById),
      weightMin: eventWeightMin(e.kind, e.durationSec),
      eventKind: e.kind,
      meta: e.meta,
    });
  }

  for (const s of sessionDetails) {
    const ctx = s.context ? CONTEXT_LABELS[s.context] ?? s.context : undefined;
    timeline.push({
      at: s.date,
      kind: "session",
      label: "Séance",
      detail: [
        ctx,
        `${s.durationMin} min`,
        `${s.userTurns} échanges`,
        s.inputTokens + s.outputTokens > 0
          ? `${(s.inputTokens + s.outputTokens).toLocaleString("fr-FR")} tok`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      weightMin: Math.max(s.durationMin, 1),
      sessionId: s.id,
    });
  }

  for (const t of threads) {
    if (t.status !== "done" || !t.doneAt) continue;
    timeline.push({
      at: t.doneAt,
      kind: "thread_done",
      label: "Truc réglé",
      detail: t.text.slice(0, 100),
      weightMin: DONE_WEIGHT_MIN,
      threadId: t.id,
    });
  }

  for (const f of feedbacks) {
    timeline.push({
      at: f.createdAt,
      kind: "feedback",
      label: "Retour",
      detail: f.message.slice(0, 100),
      weightMin: FEEDBACK_WEIGHT_MIN,
      feedbackId: f.id,
    });
  }

  for (const u of usageLog) {
    if (u.route === "session" && u.sessionId) continue;
    timeline.push({
      at: u.at,
      kind: "api",
      label: ROUTE_LABELS[u.route] ?? u.route,
      detail: [
        u.exchangeKind,
        u.exchangeIndex != null ? `#${u.exchangeIndex}` : null,
        `${u.inputTokens + u.outputTokens} tok`,
      ]
        .filter(Boolean)
        .join(" · "),
      weightMin: Math.max(0.15, (u.inputTokens + u.outputTokens) / 8000),
      sessionId: u.sessionId ?? undefined,
      tokens: u.inputTokens + u.outputTokens,
      eventKind: u.exchangeKind ?? u.route,
    });
  }

  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const { dayBands, activityDays } = buildDayBands(timeline);

  const usageEntries: AdminUsageLogEntry[] = usageLog.map((u) => ({
    id: u.id,
    at: u.at,
    route: u.route,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    exchangeKind: u.exchangeKind,
    exchangeIndex: u.exchangeIndex,
    sessionId: u.sessionId,
    sessionContext: u.sessionContext,
    stopReason: u.stopReason,
    latencyMs: u.latencyMs,
  }));

  const weightMin90 = dayBands.reduce((a, b) => a + b.totalWeightMin, 0);
  const tokensTotal = usageLog.reduce(
    (a, u) => a + u.inputTokens + u.outputTokens,
    0,
  );

  return {
    profile: {
      id: userId,
      email,
      name: settings.name,
      signedUp,
      situation: settings.situation,
      situationUntil: settings.situationUntil,
      defaultDurationMin: settings.defaultDurationMin,
      notifyTimezone: settings.notifyTimezone,
    },
    engagement,
    backlog: { open, snoozed, done, recent },
    threads: threads
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({
        id: t.id,
        text: t.text,
        status: t.status,
        kind: t.kind,
        createdAt: t.createdAt,
        doneAt: t.doneAt,
        touchedAt: t.touchedAt,
        note: t.note,
        effort: t.effort,
        due: t.due,
      })),
    notifs: {
      pushEnabled: settings.notifyEnabled,
      emailEnabled: settings.notifyEmailEnabled,
      notifyTime: settings.notifyTime,
      hasPushSub,
    },
    timeline,
    dayBands: dayBands.slice(0, 60),
    activityDays,
    sessions: sessionDetails,
    feedbacks: feedbacks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    usageLog: usageEntries,
    totals: {
      weightMin90: Math.round(weightMin90 * 10) / 10,
      tokensTotal,
      apiCalls: usageLog.length,
    },
  };
}
