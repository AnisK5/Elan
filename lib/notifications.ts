import type { SessionContext, Settings, Thread } from "./types";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { apiFetch } from "./anthropic";
import { OUTDOOR_DURATION } from "./constants";
import { isDeskPlanCandidate } from "./plan-candidates";

export const DEFAULT_NOTIFY_TIME = "09:00";
export const NOTIFY_FIRED_KEY = "elan.notify.fired.v1";
export const NOTIFY_PROMPT_DISMISS_KEY = "elan.notify.promptDismissed.v1";

const RITUAL_TAG = "elan-ritual-morning";
const ADJUST_SUFFIX = " Ouvre quand tu veux.";
const MAX_BODY = 178;
const NOTIFY_MESSAGE_MAX = 95;

/** Retire la durée du corps si elle est déjà dans le titre. */
export function polishNotifyMessage(text: string): string {
  let m = text.replace(/\s+/g, " ").trim();
  m = m.replace(
    /^je te propose une sortie, pour (?:que l['’]on )?/i,
    "",
  );
  m = m.replace(/^je te propose une sortie(?:\s*[—,-]\s*)?/i, "");
  m = m.replace(
    /^je te propose \d+\s*min(?:utes?)?(?: aujourd'?hui)?(?:\s*[—,-]\s*)?/i,
    "",
  );
  m = m.replace(/^\d+\s*min(?:utes?)?(?:\s*[—,-]\s*)?/i, "");
  return m.trim();
}

export interface RitualNotificationPayload {
  title: string;
  body: string;
  tag: string;
  pick: string;
  /** Corps notif sans suffixe — pour cohérence séance. */
  planMessage: string;
}

export interface PlanForNotify {
  message: string;
  pick: string;
}

export interface PlanStatsForNotify {
  addedLast7: number;
  doneLast7: number;
  sessionsLast7: number;
  minutesLast7: number;
  daysSinceLastSession: number | null;
  stale14: number;
}

/** Une ligne courte, sans sauter de mots en plein milieu si possible. */
export function compressPlanLine(text: string, maxLen: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) return "";
  if (one.length <= maxLen) return one;
  const slice = one.slice(0, maxLen - 1);
  const atWord = slice.replace(/\s+\S*$/, "").trim();
  return (atWord.length > maxLen * 0.5 ? atWord : slice.trim()) + "…";
}

/** Conseil minimal sans LLM — concret, sans compter le backlog. */
export function buildOfflinePlanHint(
  threads: Thread[],
  minutes = 15,
): { message: string; pick: string } {
  const open = threads.filter(
    (t) => t.status === "open" && isDeskPlanCandidate(t),
  );
  if (open.length === 0) {
    return {
      message: "Rien qui presse. Un petit point quand tu veux ?",
      pick: "5",
    };
  }

  const now = Date.now();
  const best = [...open].sort((a, b) => {
    const score = (t: Thread) => {
      let s = 0;
      if (t.plannedFor && Date.parse(t.plannedFor) < now) s += 3;
      if (t.due && Date.parse(t.due) < now) s += 1;
      if (now - Date.parse(t.createdAt) > 14 * 86_400_000) s += 1;
      return s;
    };
    return score(b) - score(a);
  })[0];

  const label = compressPlanLine(best.text, 55);
  return {
    message: `${label} — on s'y met ?`,
    pick: String(minutes > 0 ? minutes : 15),
  };
}

/** Titre + corps notif : durée ou Sortie, contenu du plan, invitation à ajuster. */
export function buildRitualNotification(opts: {
  minutes: number;
  planMessage: string;
  openCount: number;
  slot?: "sortie";
}): RitualNotificationPayload {
  const title =
    opts.slot === "sortie" ? "Élan · Sortie" : `Élan · ${opts.minutes} min`;
  const room = MAX_BODY - ADJUST_SUFFIX.length;

  let core: string;
  if (opts.openCount === 0) {
    core = "Rien qui presse. Un petit point quand tu veux ?";
  } else if (opts.planMessage.trim()) {
    core = compressPlanLine(
      polishNotifyMessage(opts.planMessage),
      Math.min(room, NOTIFY_MESSAGE_MAX),
    );
  } else {
    core = "Ton créneau est prêt — j'ai une idée pour toi.";
  }

  return {
    title,
    body: core + ADJUST_SUFFIX,
    tag: RITUAL_TAG,
    pick: opts.slot === "sortie" ? "sortie" : String(opts.minutes),
    planMessage: opts.planMessage.trim()
      ? polishNotifyMessage(opts.planMessage)
      : core,
  };
}

export function parseNotifyTime(value: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function isNotifyTimeNow(
  notifyTime: string,
  timezone?: string,
  at = new Date(),
): boolean {
  const p = parseNotifyTime(notifyTime);
  if (!p) return false;
  const { h, m } = clockInTimezone(timezone, at);
  return h === p.h && m === p.m;
}

/** Heure:minute courantes dans le fuseau (pour le cron serveur). */
export function clockInTimezone(
  timezone: string | undefined,
  at = new Date(),
): { h: number; m: number } {
  const tz =
    timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(at);
  return {
    h: Number(parts.find((x) => x.type === "hour")?.value),
    m: Number(parts.find((x) => x.type === "minute")?.value),
  };
}

/**
 * Fenêtre « c'est l'heure » pour le cron (toutes les 5–60 min).
 * Vrai dès que l'heure choisie est passée aujourd'hui — pas besoin de tomber
 * à la minute près (contrairement au repli local qui tick chaque minute).
 */
export function isNotifyTimeDue(
  notifyTime: string,
  timezone: string | undefined,
  at = new Date(),
): boolean {
  const p = parseNotifyTime(notifyTime);
  if (!p) return false;
  const { h, m } = clockInTimezone(timezone, at);
  const nowMin = h * 60 + m;
  const targetMin = p.h * 60 + p.m;
  return nowMin >= targetMin;
}

/** YYYY-MM-DD dans le fuseau de la personne. */
export function dateKeyInTimezone(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function getDeviceTimezone(): string {
  if (typeof Intl === "undefined") return "Europe/Paris";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function isWebPushClientConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/** Enregistre l'abonnement Web Push (compte Supabase requis). */
export async function subscribeWebPush(
  accessToken: string,
  opts: { notifyTime: string; timezone: string; notifyEmailEnabled?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, error: "push-not-configured" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "push-unsupported" };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: "bad-subscription" };
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
      notifyTime: opts.notifyTime,
      timezone: opts.timezone,
      notifyEmailEnabled: opts.notifyEmailEnabled ?? false,
    }),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? "subscribe-failed" };
  }
  return { ok: true };
}

/** Enregistre heure / fuseau (settings + push serveur si compte). */
export async function persistNotifySchedule(opts: {
  settings: Settings;
  update: (s: Settings) => void;
  notifyTime: string;
  notifyEnabled?: boolean;
  notifyEmailEnabled?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const notifyTime = opts.notifyTime.trim() || DEFAULT_NOTIFY_TIME;
  if (!parseNotifyTime(notifyTime)) {
    return { ok: false, error: "invalid-time" };
  }
  const tz = getDeviceTimezone();
  const enabled = opts.notifyEnabled ?? opts.settings.notifyEnabled ?? false;
  const next: Settings = {
    ...opts.settings,
    notifyEnabled: enabled,
    notifyTime,
    notifyTimezone: tz,
    notifyEmailEnabled:
      opts.notifyEmailEnabled ?? opts.settings.notifyEmailEnabled ?? false,
  };
  opts.update(next);

  if (
    !enabled ||
    !isWebPushClientConfigured() ||
    !isSupabaseConfigured()
  ) {
    return { ok: true };
  }

  const sb = getSupabase();
  if (!sb) return { ok: true };
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.access_token) {
    return { ok: true };
  }

  const push = await subscribeWebPush(session.access_token, {
    notifyTime,
    timezone: tz,
    notifyEmailEnabled: next.notifyEmailEnabled,
  });
  if (!push.ok) {
    return {
      ok: false,
      error:
        push.error === "push-not-configured"
          ? "push-not-configured"
          : "subscribe-failed",
    };
  }
  return { ok: true };
}

export function todayDateKey(at = new Date()): string {
  return at.toDateString();
}

export function wasNotifyFiredToday(at = new Date()): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(NOTIFY_FIRED_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { date?: string };
    return j.date === todayDateKey(at);
  } catch {
    return false;
  }
}

export function markNotifyFiredToday(at = new Date()): void {
  localStorage.setItem(
    NOTIFY_FIRED_KEY,
    JSON.stringify({ date: todayDateKey(at) }),
  );
}

export function isNotifyPromptDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(NOTIFY_PROMPT_DISMISS_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { until?: number };
    return typeof j.until === "number" && Date.now() < j.until;
  } catch {
    return false;
  }
}

export function dismissNotifyPrompt(days = 30): void {
  localStorage.setItem(
    NOTIFY_PROMPT_DISMISS_KEY,
    JSON.stringify({ until: Date.now() + days * 86_400_000 }),
  );
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function showRitualNotification(
  payload: RitualNotificationPayload,
): Promise<void> {
  if (typeof window === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const opts: NotificationOptions = {
    body: payload.body,
    tag: payload.tag,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: "/?ritual=1" },
  };
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(payload.title, opts);
    return;
  }
  new Notification(payload.title, opts);
}

export async function fetchPlanForNotification(
  threads: Thread[],
  stats: PlanStatsForNotify,
  meta?: { name?: string },
  context: SessionContext = "desk",
): Promise<PlanForNotify | null> {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) {
    return { message: "", pick: "15" };
  }
  try {
    const deskRes = await apiFetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: open, stats, context, meta }),
    });
    if (!deskRes.ok) return null;
    const desk = (await deskRes.json()) as {
      message?: string;
      pick?: string;
    };
    const pick = desk.pick ?? "15";
    const isSortie = pick === "sortie";
    const chosen = Number(pick);
    const notifyRes = await apiFetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threads: open,
        stats,
        context: "desk",
        meta,
        forNotify: true,
        chosen: isSortie ? undefined : Number.isFinite(chosen) ? chosen : 15,
        sourceMessage: desk.message,
      }),
    });
    if (notifyRes.ok) {
      const n = (await notifyRes.json()) as { message?: string; pick?: string };
      const msg = (n.message ?? "").trim();
      if (msg) return { message: msg, pick };
    }
    return {
      message: (desk.message ?? "").trim(),
      pick,
    };
  } catch {
    return null;
  }
}

export async function fireRitualNotification(
  opts: {
    threads: Thread[];
    stats: PlanStatsForNotify;
    name?: string;
  },
  preview = false,
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission !== "granted") return false;
  if (!preview && wasNotifyFiredToday()) return false;

  const open = opts.threads.filter((t) => t.status === "open");
  const plan =
    (await fetchPlanForNotification(
      opts.threads,
      opts.stats,
      { name: opts.name },
      "desk",
    )) ?? buildOfflinePlanHint(opts.threads);
  const minutes = plan?.pick === "sortie" ? OUTDOOR_DURATION : Number(plan?.pick);
  const payload = buildRitualNotification({
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 15,
    slot: plan?.pick === "sortie" ? "sortie" : undefined,
    planMessage: plan.message ?? "",
    openCount: open.length,
  });
  await showRitualNotification(payload);
  if (!preview) markNotifyFiredToday();
  return true;
}
