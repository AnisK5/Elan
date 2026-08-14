import webpush from "web-push";
import type { RitualNotificationPayload } from "./notifications";
import { buildRitualLaunchUrl } from "./ritual-pending";

const MAILTO = process.env.VAPID_CONTACT_EMAIL ?? "mailto:hello@elan.app";

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

export function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(MAILTO, publicKey, privateKey);
  return true;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: RitualNotificationPayload,
): Promise<void> {
  if (!configureWebPush()) {
    throw new Error("web-push-not-configured");
  }
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: buildRitualLaunchUrl(payload.pick, payload.planMessage),
      tag: payload.tag,
      pick: payload.pick,
      planMessage: payload.planMessage,
    }),
  );
}

export function isPushSubscriptionGone(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    (err as { statusCode: number }).statusCode === 410
  );
}
