import type { PlanStatsForNotify } from "./notifications";
import type { SessionContext, Thread } from "./types";

/** Appel interne à /api/plan (prompt complet, cron + preview serveur). */
export async function generatePlanViaApi(opts: {
  threads: Thread[];
  stats: PlanStatsForNotify;
  context?: SessionContext;
  meta?: { name?: string };
}): Promise<{ message: string; pick: string } | null> {
  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

  try {
    const res = await fetch(`${base}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threads: opts.threads.filter((t) => t.status === "open"),
        stats: opts.stats,
        context: opts.context ?? "desk",
        meta: opts.meta,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { message?: string; pick?: string };
    return { message: (j.message ?? "").trim(), pick: j.pick ?? "15" };
  } catch (e) {
    console.error("[plan-fetch]", e);
    return null;
  }
}
