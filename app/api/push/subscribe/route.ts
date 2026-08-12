import { getUserFromBearer } from "@/lib/auth-request";
import { isWebPushConfigured } from "@/lib/push-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  notifyTime?: string;
  timezone?: string;
}

export async function POST(req: Request) {
  if (!isWebPushConfigured()) {
    return Response.json({ error: "push-not-configured" }, { status: 503 });
  }

  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const { subscription, notifyTime, timezone } = body;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return Response.json({ error: "bad-subscription" }, { status: 400 });
  }

  const { error: subErr } = await admin.from("elan_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (subErr) {
    console.error("[push/subscribe]", subErr.message);
    return Response.json({ error: "db-error" }, { status: 500 });
  }

  const { error: setErr } = await admin
    .from("elan_settings")
    .update({
      notify_enabled: true,
      notify_time: notifyTime ?? "09:00",
      notify_timezone: timezone ?? "Europe/Paris",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (setErr) {
    console.error("[push/subscribe] settings", setErr.message);
    return Response.json({ error: "settings-error" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
