import type { ChatMessage, SessionContext } from "./types";
import type { AdminUserRow } from "./admin-stats";

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
  transcript: ChatMessage[];
}

export interface AdminFeedbackItem {
  id: string;
  message: string;
  mood: string | null;
  source: string;
  createdAt: string;
}

export type AdminTimelineKind =
  | "event"
  | "session"
  | "thread_done"
  | "feedback";

export interface AdminTimelineEntry {
  at: string;
  kind: AdminTimelineKind;
  label: string;
  detail?: string;
  meta?: Record<string, unknown>;
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
  notifs: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    notifyTime: string;
    hasPushSub: boolean;
  };
  timeline: AdminTimelineEntry[];
  sessions: AdminSessionDetail[];
  feedbacks: AdminFeedbackItem[];
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

function eventLabel(kind: string, meta?: Record<string, unknown>): string {
  const base = EVENT_LABELS[kind] ?? kind;
  if (kind === "notify_on" && meta?.channel) {
    return `${base} (${String(meta.channel)})`;
  }
  return base;
}

function eventDetail(
  kind: string,
  durationSec?: number,
  meta?: Record<string, unknown>,
): string | undefined {
  if (kind === "session" || kind === "dwell") {
    const min = Math.round((durationSec ?? 0) / 60);
    if (min > 0) return `${min} min`;
  }
  if (kind === "capture" && meta?.threadId) {
    return String(meta.threadId);
  }
  if (kind === "thread_done" && meta?.threadId) {
    return String(meta.threadId);
  }
  if (kind === "feedback" && meta?.mood) {
    return String(meta.mood);
  }
  return undefined;
}

const CONTEXT_LABELS: Record<string, string> = {
  desk: "Bureau",
  sortie: "Sortie",
  courses: "Courses",
  regulier: "Réguliers",
  deposer: "Déposer",
};

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
  hasPushSub: boolean,
): AdminUserDetail {
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

  const sessionDetails: AdminSessionDetail[] = sessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({
      id: s.id,
      date: s.date,
      durationMin: s.durationMin,
      context: (s.context as SessionContext | undefined) ?? undefined,
      messageCount: s.transcript.length,
      transcript: s.transcript,
    }));

  const timeline: AdminTimelineEntry[] = [];

  for (const e of events) {
    timeline.push({
      at: e.at,
      kind: "event",
      label: eventLabel(e.kind, e.meta),
      detail: eventDetail(e.kind, e.durationSec, e.meta),
      meta: e.meta,
    });
  }

  for (const s of sessionDetails) {
    const ctx = s.context ? CONTEXT_LABELS[s.context] ?? s.context : undefined;
    timeline.push({
      at: s.date,
      kind: "session",
      label: "Séance",
      detail: [ctx, `${s.durationMin} min`, `${s.messageCount} msg`]
        .filter(Boolean)
        .join(" · "),
      meta: { sessionId: s.id },
    });
  }

  for (const t of threads) {
    if (t.status !== "done" || !t.doneAt) continue;
    timeline.push({
      at: t.doneAt,
      kind: "thread_done",
      label: "Truc réglé",
      detail: t.text.slice(0, 80),
      meta: { threadId: t.id },
    });
  }

  for (const f of feedbacks) {
    timeline.push({
      at: f.createdAt,
      kind: "feedback",
      label: "Retour",
      detail: f.mood ? `${f.mood} — ${f.message.slice(0, 60)}` : f.message.slice(0, 80),
      meta: { feedbackId: f.id },
    });
  }

  timeline.sort((a, b) => b.at.localeCompare(a.at));

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
    notifs: {
      pushEnabled: settings.notifyEnabled,
      emailEnabled: settings.notifyEmailEnabled,
      notifyTime: settings.notifyTime,
      hasPushSub,
    },
    timeline: timeline.slice(0, 200),
    sessions: sessionDetails,
    feedbacks: feedbacks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
