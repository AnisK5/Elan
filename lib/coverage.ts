/** Couverture : chaque truc a un prochain droit — pas seulement une DL. */

import {
  daysSince,
  isContainerThread,
  reguliersDueFromThreads,
} from "./entretiens";
import { effortMins } from "./deadline-load";
import { splitPlanThreads } from "./plan-candidates";
import type { Thread } from "./types";

/** Sans date : droit à un passage au plus tard tous les 7 jours. */
export const PASSAGE_DAYS = 7;
/** Jamais touché / pas revu depuis 14j → affamé, tour obligatoire. */
export const STARVE_DAYS = 14;

export type QueueItem = {
  id: string;
  text: string;
  daysSince: number;
  mins: number;
};

export type CoverageSnapshot = {
  starved: QueueItem[];
  passageDue: QueueItem[];
  intentions: QueueItem[];
  regularsDue: { label: string }[];
  mixRequired: boolean;
  moreVolume: boolean;
};

function shortLabel(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 40 ? t : `${t.slice(0, 38).trim()}…`;
}

function lastPassageIso(t: Thread): string {
  return t.touchedAt ?? t.createdAt;
}

function dayDiffAt(iso: string, at: Date): number {
  const today = new Date(at);
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Fenêtre dure déjà portée par CHARGE FENÊTRES — pas la file. */
function hasHardWindow(t: Thread, at: Date): boolean {
  if (!t.due) return false;
  return dayDiffAt(t.due, at) <= 1;
}

/** Due plus loin = le prochain droit EST la date, pas un passage 7j. */
function hasFutureDue(t: Thread, at: Date): boolean {
  if (!t.due) return false;
  return dayDiffAt(t.due, at) > 1;
}

function toItem(t: Thread, at: Date): QueueItem {
  return {
    id: t.id,
    text: t.text.trim(),
    daysSince: daysSince(lastPassageIso(t), at),
    mins: effortMins(t.effort),
  };
}

export type PlanRhythm = {
  addedLast7?: number;
  doneLast7?: number;
  sessionsLast7?: number;
  minutesLast7?: number;
  stale14?: number;
};

/**
 * File sans DL : passage dû (≥7j) et affamés (≥14j).
 * Les relances en attente et les containers sont hors jeu (même filtre que le plan).
 */
export function coverageSnapshot(
  threads: Thread[],
  stats?: PlanRhythm,
  at = new Date(),
): CoverageSnapshot {
  const open = threads.filter(
    (t) => t.status === "open" && !isContainerThread(t),
  );
  const { candidates } = splitPlanThreads(open);
  const queueable = candidates.filter(
    (t) => !hasHardWindow(t, at) && !hasFutureDue(t, at),
  );

  const starved: QueueItem[] = [];
  const passageDue: QueueItem[] = [];
  const intentions: QueueItem[] = [];

  for (const t of queueable) {
    const item = toItem(t, at);
    if (item.daysSince >= STARVE_DAYS) starved.push(item);
    else if (item.daysSince >= PASSAGE_DAYS) passageDue.push(item);
    if (t.plannedFor && dayDiffAt(t.plannedFor, at) <= 0) {
      intentions.push(item);
    }
  }

  starved.sort((a, b) => b.daysSince - a.daysSince);
  passageDue.sort((a, b) => b.daysSince - a.daysSince);

  const regularsDue = reguliersDueFromThreads(threads, at).map((r) => ({
    label: r.label,
  }));

  const mixRequired =
    starved.length > 0 ||
    regularsDue.length > 0 ||
    passageDue.length > 0 ||
    intentions.length > 0;

  const added = stats?.addedLast7 ?? 0;
  const done = stats?.doneLast7 ?? 0;
  const minutes = stats?.minutesLast7 ?? 0;
  const sessions = stats?.sessionsLast7 ?? 0;
  const stale14 = stats?.stale14 ?? 0;
  const backlog = starved.length + passageDue.length;

  const moreVolume =
    starved.length >= 2 ||
    stale14 >= 3 ||
    (added > done + 1 && backlog > 0) ||
    (backlog >= 3 && (minutes < 45 || sessions < 2));

  return {
    starved,
    passageDue,
    intentions,
    regularsDue,
    mixRequired,
    moreVolume,
  };
}

function listLines(items: { text?: string; label?: string; daysSince?: number }[], max: number): string {
  return items
    .slice(0, max)
    .map((i) => {
      const name = shortLabel(i.text ?? i.label ?? "");
      const age =
        typeof i.daysSince === "number" ? ` · ${i.daysSince}j sans passage` : "";
      return `- « ${name} »${age}`;
    })
    .join("\n");
}

/** Bloc injecté dans le prompt plan — mixité, pas une to-do géante. */
export function renderCoverageCharge(
  threads: Thread[],
  stats?: PlanRhythm,
  at = new Date(),
): string {
  const c = coverageSnapshot(threads, stats, at);

  const starvedBlock =
    c.starved.length === 0
      ? "Affamés (≥14j sans passage, sans DL) : aucun."
      : `Affamés (≥14j sans passage, sans DL) — ${c.starved.length} ; AU MOINS UN doit avoir son tour aujourd'hui (pas tous) :\n${listLines(c.starved, 3)}`;

  const passageBlock =
    c.passageDue.length === 0
      ? "File (prochain droit aujourd'hui, 7–13j) : aucun."
      : `File (prochain droit, 7–13j sans passage) — ${c.passageDue.length} ; un suffit si tu en prends un :\n${listLines(c.passageDue, 2)}`;

  const regulierBlock =
    c.regularsDue.length === 0
      ? "Réguliers mûrs : aucun."
      : `Réguliers mûrs — ${c.regularsDue.length} (mode:"regulier") : ${c.regularsDue.map((r) => r.label).slice(0, 3).join(" · ")}`;

  const intentBlock =
    c.intentions.length === 0
      ? ""
      : `\nIntention de jour (prévu aujourd'hui / passé) : ${c.intentions.map((i) => shortLabel(i.text)).slice(0, 2).join(" · ")}`;

  const mixBlock = c.mixRequired
    ? `MIX OBLIGATOIRE : au moins UN moment = file / affamé / régulier / intention — pas 100 % DL.
Un seul gros bloc (30/50) EST une forme valide s'il PORTE cet item (ex. 50 sur un affamé). Ne saucissonne PAS en 3×15 pour « tout toucher ». Si DL dure + mix : 50 (gros) + 15 (mix) va, deux gros aussi ; pas trois petits à la place d'un vrai focus.`
    : `MIX : rien n'est dû hors fenêtres — un petit pas ou un gros focus, au choix.`;

  const volumeBlock = c.moreVolume
    ? `VOLUME : le rythme 7j ne porte pas le stock (affamés/file ou déposés ≫ bouclés). Allonge (30/50) ou ajoute un moment — SANS découper un gros bloc en micro-pas.`
    : `VOLUME : le rythme tient, ou le stock file est mince. Ne force pas de séances en plus.`;

  return `CHARGE COUVERTURE (calcul — chaque truc a un prochain droit, DL ou passage 7j) :
${starvedBlock}
${passageBlock}
${regulierBlock}${intentBlock}

${mixBlock}
${volumeBlock}
Point 3 du why : cite mix (oui/non + quoi). Point 5 : « déborde ? NON » = fenêtres DU JOUR couvertes ET mix tenu (un tour, pas toute la liste). Le reste de la file a encore son droit cette semaine — ne la liste pas sur la carte.`;
}
