/** Ouverture de séance = le conseil déjà lu, pas un second tirage. */

const HELLO = "Salut, content de te retrouver. ";

const FROM_PLAN = [
  /^je te propose(?:rais)? un créneau de \d+ min, pour que l['’]on /i,
  /^je te propose(?:rais)? un créneau de \d+ min, pour /i,
  /^pour ce créneau de \d+ min, je propose que l['’]on /i,
  /^pour ce créneau de \d+ min, je propose /i,
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

/** Message d'ouverture : le conseil du créneau + une question courte. */
export function sessionOpeningFromBrief(brief: string): string {
  const body = sessionBodyFromBrief(brief);
  if (!body) return "";
  const withHello = alreadyGreets(body) ? body : `${HELLO}${body}`;
  if (/\?\s*$/.test(withHello)) return withHello;
  return `${withHello.replace(/[.!?…]*\s*$/, ".")} On s'y met ?`;
}
