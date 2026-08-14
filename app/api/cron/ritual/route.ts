import { verifyCronSecret } from "@/lib/auth-request";
import { isWebPushConfigured } from "@/lib/push-server";
import { runRitualPushCron } from "@/lib/ritual-cron";
import { isSupabaseAdminConfigured } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Appelé par pg_cron Supabase (toutes les heures) — rappels matin Web Push. ?force=1 pour test. */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isWebPushConfigured() || !isSupabaseAdminConfigured()) {
    return Response.json({ error: "not-configured" }, { status: 503 });
  }

  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const result = await runRitualPushCron({ force });
    return Response.json({ ...result, force });
  } catch (e) {
    console.error("[cron/ritual]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "cron-failed" },
      { status: 500 },
    );
  }
}
