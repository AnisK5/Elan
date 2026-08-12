import type { SessionContext, Thread } from "./types";

export const DEFAULT_NOTIFY_TIME = "09:00";
export const NOTIFY_FIRED_KEY = "elan.notify.fired.v1";
export const NOTIFY_PROMPT_DISMISS_KEY = "elan.notify.promptDismissed.v1";

const RITUAL_TAG = "elan-ritual-morning";
const ADJUST_SUFFIX = " Tap pour lancer — ou ouvrir pour ajuster.";
const MAX_BODY = 200;

export interface RitualNotificationPayload {
  title: string;
  body: string;
  tag: string;
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

/** Titre + corps notif : durée, contenu du plan, invitation à ajuster. */
export function buildRitualNotification(opts: {
  minutes: number;
  planMessage: string;
  openCount: number;
}): RitualNotificationPayload {
  const title = `Élan · ${opts.minutes} min`;
  const room = MAX_BODY - ADJUST_SUFFIX.length;

  let core: string;
  if (opts.openCount === 0) {
    core =
      "Rien qui presse. Un créneau pour faire le point — je te propose quoi en mettre.";
  } else if (opts.planMessage.trim()) {
    core = compressPlanLine(opts.planMessage, room);
  } else {
    core = `${opts.openCount} truc${opts.openCount > 1 ? "s" : ""} en attente — je te propose par quoi commencer.`;
  }

  return {
    title,
    body: core + ADJUST_SUFFIX,
    tag: RITUAL_TAG,
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
  const h = Number(parts.find((x) => x.type === "hour")?.value);
  const m = Number(parts.find((x) => x.type === "minute")?.value);
  return h === p.h && m === p.m;
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
  opts: { notifyTime: string; timezone: string },
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
    }),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? "subscribe-failed" };
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
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: open, stats, context, meta }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      message?: string;
      pick?: string;
    };
    return {
      message: (j.message ?? "").trim(),
      pick: j.pick ?? "15",
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
  const plan = await fetchPlanForNotification(
    opts.threads,
    opts.stats,
    { name: opts.name },
    "desk",
  );
  const minutes = plan?.pick ? Number(plan.pick) : 15;
  const payload = buildRitualNotification({
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 15,
    planMessage: plan?.message ?? "",
    openCount: open.length,
  });
  await showRitualNotification(payload);
  if (!preview) markNotifyFiredToday();
  return true;
}
