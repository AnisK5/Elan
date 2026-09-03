import { PLAN_VERSION } from "./constants";
import type { SessionContext, Thread } from "./types";

export type DayPlanContext = Exclude<SessionContext, "deposer">;

export interface DayPlanSlot {
  why: string;
  message: string;
  pick: string;
  /** Messages user du chat au moment du conseil — pour le bouton stale. */
  chatLen?: number;
}

export interface DayPlanCache {
  v: number;
  /** YYYY-MM-DD local (ou fuseau du rappel côté cron). */
  date: string;
  sig: string;
  slots: Partial<Record<DayPlanContext, DayPlanSlot>>;
}

export function planDateKey(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** La pile seule — pour relire un plan matin avant que le cadre de vie soit hydraté. */
export function pileSignature(openThreads: Thread[]): string {
  return openThreads
    .map(
      (t) =>
        `${t.id}:${t.due ?? ""}:${t.plannedFor ?? ""}:${t.snoozedUntil ?? ""}:${t.effort ?? ""}:${t.kind}:${t.text}:${t.note ?? ""}`,
    )
    .sort()
    .join("|");
}

/** Ce qui invalide l'arbitrage : la pile et le cadre de vie — pas la durée. */
export function whySignature(
  openThreads: Thread[],
  situationText: string,
): string {
  return `${pileSignature(openThreads)}#sit:${situationText.trim()}`;
}

export function isDayPlanContext(ctx: string): ctx is DayPlanContext {
  return (
    ctx === "desk" ||
    ctx === "sortie" ||
    ctx === "courses" ||
    ctx === "regulier"
  );
}

export function parseDayPlan(raw: unknown): DayPlanCache | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.v !== "number" || typeof o.date !== "string" || typeof o.sig !== "string") {
    return null;
  }
  const slots: DayPlanCache["slots"] = {};
  const src =
    o.slots && typeof o.slots === "object"
      ? (o.slots as Record<string, unknown>)
      : {};
  for (const key of ["desk", "sortie", "courses", "regulier"] as const) {
    const s = src[key];
    if (!s || typeof s !== "object") continue;
    const slot = s as Record<string, unknown>;
    if (typeof slot.why !== "string" || !slot.why.trim()) continue;
    if (typeof slot.message !== "string" || !slot.message.trim()) continue;
    if (typeof slot.pick !== "string") continue;
    slots[key] = {
      why: slot.why.trim(),
      message: slot.message.trim(),
      pick: slot.pick,
      ...(typeof slot.chatLen === "number" ? { chatLen: slot.chatLen } : {}),
    };
  }
  return { v: o.v, date: o.date, sig: o.sig, slots };
}

export function dayPlanMatches(
  plan: DayPlanCache | null,
  sig: string,
  date: string = planDateKey(),
  v: number = PLAN_VERSION,
): plan is DayPlanCache {
  return Boolean(
    plan && plan.v === v && plan.date === date && plan.sig === sig,
  );
}

/** Même jour + même pile, même si le `#sit:` n'est pas encore hydraté. */
export function dayPlanPileMatches(
  plan: DayPlanCache | null,
  openThreads: Thread[],
  date: string = planDateKey(),
  v: number = PLAN_VERSION,
): plan is DayPlanCache {
  if (!plan || plan.v !== v || plan.date !== date) return false;
  const sep = plan.sig.lastIndexOf("#sit:");
  const cachedPile = sep >= 0 ? plan.sig.slice(0, sep) : plan.sig;
  return cachedPile === pileSignature(openThreads);
}

export function slotOf(
  plan: DayPlanCache | null,
  ctx: SessionContext,
): DayPlanSlot | null {
  if (!plan || !isDayPlanContext(ctx)) return null;
  return plan.slots[ctx] ?? null;
}

/**
 * Slot du jour pour l'affichage, même si la pile a bougé (sig différente).
 * Sert à montrer le dernier conseil + bouton « actualiser » au lieu de refetch.
 */
export function todaySlot(
  plan: DayPlanCache | null,
  ctx: SessionContext,
  date: string = planDateKey(),
  v: number = PLAN_VERSION,
): DayPlanSlot | null {
  if (!plan || plan.v !== v || plan.date !== date) return null;
  return slotOf(plan, ctx);
}

/** Faut-il appeler Claude automatiquement ? 1er conseil du jour / forcé. */
export function shouldAutoFetchPlan(opts: {
  hasTodaySlot: boolean;
  forceRefresh: boolean;
  diagnosticOn?: boolean;
}): boolean {
  if (opts.forceRefresh) return true;
  if (opts.diagnosticOn) return true;
  return !opts.hasTodaySlot;
}

/** Le conseil affiché ne correspond plus à la pile / cadre de vie. */
export function isDayPlanStale(
  plan: DayPlanCache | null,
  openThreads: Thread[],
  situationText: string,
  date: string = planDateKey(),
): boolean {
  if (!plan || plan.date !== date || plan.v !== PLAN_VERSION) return true;
  const sig = whySignature(openThreads, situationText);
  if (dayPlanMatches(plan, sig, date)) return false;
  // Même pile (cron / situation pas encore hydratée) → encore valide.
  if (dayPlanPileMatches(plan, openThreads, date)) return false;
  return true;
}

export function mergeDayPlans(
  local: DayPlanCache | null,
  remote: DayPlanCache | null,
): DayPlanCache | null {
  if (!remote) return local;
  if (!local) return remote;
  if (local.date !== remote.date) {
    return local.date > remote.date ? local : remote;
  }
  if (local.sig !== remote.sig) return local;
  const keys = new Set([
    ...Object.keys(local.slots),
    ...Object.keys(remote.slots),
  ]) as Set<DayPlanContext>;
  const slots: DayPlanCache["slots"] = {};
  for (const k of keys) {
    const a = local.slots[k];
    const b = remote.slots[k];
    if (a && b) {
      slots[k] = {
        why: a.why || b.why,
        message: a.message || b.message,
        pick: a.pick || b.pick,
      };
    } else {
      slots[k] = a ?? b;
    }
  }
  return { v: local.v, date: local.date, sig: local.sig, slots };
}

export function upsertDayPlanSlot(
  current: DayPlanCache | null,
  sig: string,
  ctx: DayPlanContext,
  slot: DayPlanSlot,
  date: string = planDateKey(),
): DayPlanCache {
  const base =
    current && current.v === PLAN_VERSION && current.date === date && current.sig === sig
      ? current
      : { v: PLAN_VERSION, date, sig, slots: {} };
  return {
    ...base,
    slots: { ...base.slots, [ctx]: slot },
  };
}
