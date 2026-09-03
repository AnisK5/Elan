import { PLAN_VERSION } from "./constants";
import type { SessionContext, Thread } from "./types";

export type DayPlanContext = Exclude<SessionContext, "deposer">;

export interface DayPlanMoment {
  /** Court : « Message à papa », « Draps ». */
  label: string;
  /** Mode suggéré pour ce moment. */
  mode?: DayPlanContext;
  /** Durée proposée en minutes (peut être 25 — on l'accroche au bouton le plus proche). */
  mins?: number;
  done?: boolean;
  /** Piste déclinée (« pas ce soir ») — pas une séance faite. */
  skipped?: boolean;
}

export interface DayPlanSlot {
  why: string;
  message: string;
  pick: string;
  /** Messages user du chat au moment du conseil — pour le bouton stale. */
  chatLen?: number;
  /** 1–2 moments de la journée (carte indépendante des boutons). */
  moments?: DayPlanMoment[];
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

function parseMoments(raw: unknown): DayPlanMoment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DayPlanMoment[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.label !== "string" || !o.label.trim()) continue;
    const mode =
      typeof o.mode === "string" && isDayPlanContext(o.mode) ? o.mode : undefined;
    out.push({
      label: o.label.trim().slice(0, 80),
      ...(mode ? { mode } : {}),
      ...(typeof o.mins === "number" && o.mins > 0
        ? { mins: Math.round(o.mins) }
        : {}),
      ...(o.done === true ? { done: true } : {}),
      ...(o.skipped === true ? { skipped: true } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Accroche une durée libre (ex. 25) sur le bouton 5 / 15 / 30 / 50 le plus proche. */
export function snapDeskMins(mins: number): 5 | 15 | 30 | 50 {
  const opts = [5, 15, 30, 50] as const;
  let best: 5 | 15 | 30 | 50 = 15;
  let bestDist = Infinity;
  for (const n of opts) {
    const d = Math.abs(n - mins);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

export function momentIsOpen(m: DayPlanMoment): boolean {
  return !m.done && !m.skipped;
}

function momentDeskMins(m: DayPlanMoment): 5 | 15 | 30 | 50 | null {
  // Sortie / courses : signal sur le bouton mode. Le reste (y compris
  // régulier avec durée) reste lançable en séance bureau.
  if (m.mode === "sortie" || m.mode === "courses") {
    return null;
  }
  if (typeof m.mins === "number" && m.mins > 0) return snapDeskMins(m.mins);
  if (m.mode === "regulier") return null;
  return 15;
}

/** Durées recommandées (moments encore ouverts) — un signal par créneau. */
export function durationHintSet(
  moments: DayPlanMoment[] | undefined,
): Set<5 | 15 | 30 | 50> {
  const out = new Set<5 | 15 | 30 | 50>();
  for (const m of moments ?? []) {
    if (!momentIsOpen(m)) continue;
    const n = momentDeskMins(m);
    if (n != null) out.add(n);
  }
  return out;
}

/** @deprecated alias — préférer durationHintSet */
export function durationHintCounts(
  moments: DayPlanMoment[] | undefined,
): Partial<Record<5 | 15 | 30 | 50, number>> {
  const out: Partial<Record<5 | 15 | 30 | 50, number>> = {};
  for (const n of durationHintSet(moments)) out[n] = 1;
  return out;
}

export function modeHintSet(
  moments: DayPlanMoment[] | undefined,
): Set<DayPlanContext> {
  const s = new Set<DayPlanContext>();
  for (const m of moments ?? []) {
    if (!momentIsOpen(m) || !m.mode || m.mode === "desk") continue;
    // Régulier avec durée → plutôt le bouton durée (pas d'obligation Régulier).
    if (m.mode === "regulier" && typeof m.mins === "number" && m.mins > 0) {
      continue;
    }
    s.add(m.mode);
  }
  return s;
}

/** Une séance terminée valide le prochain moment encore ouvert (pas la tâche). */
export function completeNextMoment(
  moments: DayPlanMoment[] | undefined,
  preferMode?: SessionContext,
): DayPlanMoment[] | undefined {
  if (!moments?.length) return moments;
  const openIdx = moments.findIndex(momentIsOpen);
  if (openIdx < 0) return moments;
  let idx = openIdx;
  if (preferMode && isDayPlanContext(preferMode)) {
    const match = moments.findIndex(
      (m) => momentIsOpen(m) && (m.mode ?? "desk") === preferMode,
    );
    if (match >= 0) idx = match;
  }
  return moments.map((m, i) => (i === idx ? { ...m, done: true } : m));
}

/** Décline une piste du jour — la séance n'est pas coincée dessus. */
export function skipMomentAt(
  moments: DayPlanMoment[] | undefined,
  index: number,
): DayPlanMoment[] | undefined {
  if (!moments?.length || index < 0 || index >= moments.length) return moments;
  if (!momentIsOpen(moments[index])) return moments;
  return moments.map((m, i) => (i === index ? { ...m, skipped: true } : m));
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
    const moments = parseMoments(slot.moments);
    slots[key] = {
      why: slot.why.trim(),
      message: slot.message.trim(),
      pick: slot.pick,
      ...(typeof slot.chatLen === "number" ? { chatLen: slot.chatLen } : {}),
      ...(moments ? { moments } : {}),
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
        ...(a.chatLen != null || b.chatLen != null
          ? { chatLen: a.chatLen ?? b.chatLen }
          : {}),
        ...(a.moments?.length || b.moments?.length
          ? { moments: a.moments?.length ? a.moments : b.moments }
          : {}),
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
