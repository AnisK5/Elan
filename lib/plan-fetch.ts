import type { PlanStatsForNotify } from "./notifications";
import type { SessionContext, Thread } from "./types";

function planApiBase(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://127.0.0.1:3000";
}

async function postPlan(body: Record<string, unknown>): Promise<{
  message: string;
  pick: string;
} | null> {
  const base = planApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  try {
    const res = await fetch(`${base}/api/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[plan-fetch]", res.status, base, detail.slice(0, 200));
      return null;
    }
    const j = (await res.json()) as { message?: string; pick?: string };
    const message = (j.message ?? "").trim();
    if (!message) {
      console.error("[plan-fetch] empty message from /api/plan");
      return null;
    }
    return { message, pick: j.pick ?? "15" };
  } catch (e) {
    console.error("[plan-fetch]", base, e);
    return null;
  }
}

/** Même prompt que l'accueil — durée + conseil du jour. */
export async function generatePlanViaApi(opts: {
  threads: Thread[];
  stats: PlanStatsForNotify;
  context?: SessionContext;
  meta?: { name?: string };
  chosen?: number;
}): Promise<{ message: string; pick: string } | null> {
  return postPlan({
    threads: opts.threads.filter((t) => t.status === "open"),
    stats: opts.stats,
    context: opts.context ?? "desk",
    meta: opts.meta,
    chosen: opts.chosen,
  });
}

/** Phrase courte pour notif — pick déjà fixé par generatePlanViaApi. */
export async function generateNotifyCopyViaApi(opts: {
  threads: Thread[];
  stats: PlanStatsForNotify;
  chosen?: number;
  meta?: { name?: string };
  sourceMessage?: string;
}): Promise<{ message: string; pick: string } | null> {
  return postPlan({
    threads: opts.threads.filter((t) => t.status === "open"),
    stats: opts.stats,
    context: "desk",
    meta: opts.meta,
    forNotify: true,
    chosen: opts.chosen,
    sourceMessage: opts.sourceMessage,
  });
}
