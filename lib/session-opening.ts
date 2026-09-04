/** Ouverture de séance = le conseil déjà lu, adapté au bouton cliqué. */

import type { SessionContext } from "@/lib/types";
import {
  momentIsOpen,
  snapDeskMins,
  type DayPlanMoment,
} from "@/lib/day-plan";

const HELLO = "Salut, content de te retrouver. ";

const FROM_PLAN = [
  /^je te propose(?:rais)? un créneau de \d+ min, pour que l['’]on /i,
  /^je te propose(?:rais)? un créneau de \d+ min, pour /i,
  /^pour ce créneau de \d+ min, je propose que l['’]on /i,
  /^pour ce créneau de \d+ min, je propose /i,
  /^aujourd['’]hui[,:]?\s+je te propose[^.]+\.\s*/i,
];

const FROM_SORTIE = /^je te propose(?:rais)? une sortie, pour (?:que l['’]on )?/i;

function alreadyGreets(text: string): boolean {
  return /^(salut|hello|coucou|hey|content de)\b/i.test(text.trim());
}

/** Corps de séance : même truc et même pas que le créneau, sans re-proposer la durée. */
export function sessionBodyFromBrief(brief: string): string {
  let t = brief.trim();
  if (!t) return "";
  if (FROM_SORTIE.test(t)) {
    t = t.replace(FROM_SORTIE, "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  for (const re of FROM_PLAN) {
    if (re.test(t)) {
      t = t.replace(re, "On ");
      break;
    }
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Message d'ouverture fallback : le conseil du créneau, sans redemander de commencer. */
export function sessionOpeningFromBrief(brief: string): string {
  const body = sessionBodyFromBrief(brief);
  if (!body) return "";
  const withHello = alreadyGreets(body) ? body : `${HELLO}${body}`;
  return withHello.replace(/[.!?…]*\s*$/, ".");
}

function openMoments(moments: DayPlanMoment[] | undefined): DayPlanMoment[] {
  return (moments ?? []).filter(momentIsOpen);
}

/** Moment de la carte le plus proche du bouton qu'elle vient de cliquer. */
export function pickMomentForLaunch(
  moments: DayPlanMoment[] | undefined,
  context: SessionContext,
  durationMin: number,
): DayPlanMoment | null {
  const open = openMoments(moments);
  if (open.length === 0) return null;

  if (context === "sortie" || context === "courses" || context === "regulier") {
    const byMode = open.find((m) => m.mode === context);
    if (byMode) return byMode;
    if (context === "regulier") {
      const named = open.find((m) =>
        /regulier|linge|drap|loyer|urssaf|entretien/i.test(m.label),
      );
      if (named) return named;
    }
    return null;
  }

  // Bureau : préfère un moment desk (ou sans mode) dont la durée accroche.
  const deskish = open.filter(
    (m) => !m.mode || m.mode === "desk" || m.mode === "regulier",
  );
  const pool = deskish.length > 0 ? deskish : open;
  const snapped = snapDeskMins(durationMin);
  const byMins = pool.find(
    (m) =>
      typeof m.mins === "number" &&
      m.mins > 0 &&
      snapDeskMins(m.mins) === snapped,
  );
  if (byMins) return byMins;
  return pool[0] ?? null;
}

/**
 * Brief de lancement : calé sur le bouton (durée / Régulier / Sortie),
 * en gardant le sujet de la carte du jour si un moment colle.
 */
export function sessionBriefForLaunch(opts: {
  planMessage?: string | null;
  moments?: DayPlanMoment[];
  context: SessionContext;
  durationMin: number;
}): string {
  const { planMessage, moments, context, durationMin } = opts;
  const moment = pickMomentForLaunch(moments, context, durationMin);
  const dayHint = (planMessage ?? "").trim();

  if (context === "regulier") {
    if (moment) {
      return `Créneau Régulier.\nSuggestion : « ${moment.label} » — à prendre ou à laisser, on peut en choisir un autre.`;
    }
    return "Créneau Régulier.\nOn regarde ce qui revient, sans pression.";
  }
  if (context === "sortie") {
    if (moment) {
      return `Créneau Sortie.\nSuggestion : « ${moment.label} » — on regroupe le trajet.`;
    }
    return "Créneau Sortie.\nOn regarde ce qui se fait dehors sur ton trajet.";
  }
  if (context === "courses") {
    return "Créneau Courses.\nOn part sur ta liste, et ce qui tombe sur le trajet si besoin.";
  }
  if (context === "deposer") {
    return "";
  }

  // Bureau : durée choisie d'abord ; le contenu de la carte reste une suggestion.
  if (moment) {
    return `Créneau de ${durationMin} min.\nSuggestion : « ${moment.label} » — à prendre ou à laisser.`;
  }

  if (dayHint) {
    return `Créneau de ${durationMin} min.\nSuggestion : ${dayHint}`;
  }
  return `Créneau de ${durationMin} min.\nPrésente-toi, on prend le prochain petit pas ensemble.`;
}

/** Brief quand elle lance un moment précis depuis la carte. */
export function sessionBriefForMoment(
  moment: DayPlanMoment,
  durationMin: number,
): string {
  const mode = moment.mode ?? "desk";
  if (mode === "regulier") {
    return `Créneau Régulier.\nSuggestion : « ${moment.label} » — à prendre ou à laisser, on peut en choisir un autre.`;
  }
  if (mode === "sortie") {
    return `Créneau Sortie.\nSuggestion : « ${moment.label} » — on regroupe le trajet.`;
  }
  if (mode === "courses") {
    return "Créneau Courses.\nOn part sur ta liste, et ce qui tombe sur le trajet si besoin.";
  }
  return `Créneau de ${durationMin} min.\nSuggestion : « ${moment.label} » — à prendre ou à laisser.`;
}
