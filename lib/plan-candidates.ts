import type { Thread } from "./types";
import { isContainerThread } from "./entretiens";
import { ageLabel, dayDiff, dueLabel, intentionLabel } from "./thread-labels";

/** Formulations de relance / prise de nouvelles — pas une 1ʳᵉ action avec échéance externe. */
const RELANCE_TEXT =
  /\b(relanc\w*|recontact\w*|prendre des nouvelles)\b/i;

/**
 * Notes posées par le greffier après un envoi : « relancé le 20/08, en attente… ».
 * Pas de \b JS : il casse sur les accents (é n'est pas un « word char »).
 * On accepte JJ/MM, JJ/MM/AAAA, et ISO YYYY-MM-DD.
 */
const CONTACT_VERBS =
  "relanc[ée]e?s?|envoy[ée]e?s?|contact[ée]e?s?|appel[ée]e?s?|écrit";

const CONTACT_NOTE = new RegExp(
  `(${CONTACT_VERBS})[^.\\n]{0,40}?le\\s+(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?`,
  "i",
);

const CONTACT_NOTE_ISO = new RegExp(
  `(${CONTACT_VERBS})[^.\\n]{0,40}?le\\s+(\\d{4})-(\\d{2})-(\\d{2})`,
  "i",
);

const CONTACT_NOTE_RELATIVE = new RegExp(
  `(${CONTACT_VERBS})[^.\\n]{0,30}(aujourd'?hui|hier)`,
  "i",
);

/** « vers le / à partir du / pas avant » — timing doux, PAS une fenêtre à saisir. */
const SOFT_TIMING_CUE =
  /(?:à\s+faire\s+)?(?:vers|autour\s+de|à\s+partir\s+(?:du|de)|pas\s+avant(?:\s+le)?|d['']ici|semaine\s+du)\b/i;

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseFrDayMonth(
  day: number,
  month: number,
  year?: number,
  horizon: "past" | "future" = "past",
): Date | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const today = startOfToday();
  let y = year;
  if (y == null) {
    y = today.getFullYear();
    const candidate = new Date(y, month - 1, day);
    candidate.setHours(0, 0, 0, 0);
    if (horizon === "future") {
      // « vers le 1er septembre » lu en août → cette année, pas l'an dernier.
      if (candidate.getTime() < today.getTime()) y += 1;
    } else if (candidate.getTime() > today.getTime() + 2 * 86_400_000) {
      // « relancé le 31/12 » lu en janvier → l'année d'avant.
      y -= 1;
    }
  } else if (y < 100) {
    y += 2000;
  }
  const d = new Date(y, month - 1, day);
  d.setHours(0, 0, 0, 0);
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  return d;
}

/** True si la note dit qu'on a contacté récemment (aujourd'hui ou hier). */
export function hasRecentContactNote(
  note: string | undefined,
  withinDays = 1,
): boolean {
  if (!note?.trim()) return false;
  const today = startOfToday();
  const matches: Date[] = [];

  const fr = note.match(new RegExp(CONTACT_NOTE.source, "gi"));
  if (fr) {
    for (const raw of fr) {
      const m = raw.match(CONTACT_NOTE);
      if (!m) continue;
      const day = Number(m[2]);
      const month = Number(m[3]);
      const year = m[4] ? Number(m[4]) : undefined;
      const parsed = parseFrDayMonth(day, month, year);
      if (parsed) matches.push(parsed);
    }
  }
  const iso = note.match(new RegExp(CONTACT_NOTE_ISO.source, "gi"));
  if (iso) {
    for (const raw of iso) {
      const m = raw.match(CONTACT_NOTE_ISO);
      if (!m) continue;
      const y = Number(m[2]);
      const month = Number(m[3]);
      const day = Number(m[4]);
      const parsed = parseFrDayMonth(day, month, y);
      if (parsed) matches.push(parsed);
    }
  }

  if (matches.length === 0) {
    return CONTACT_NOTE_RELATIVE.test(note);
  }

  return matches.some((d) => {
    const n = Math.round(
      (today.getTime() - d.getTime()) / 86_400_000,
    );
    return n >= 0 && n <= withinDays;
  });
}

/**
 * Date « pas avant / vers » extraite d'une note, si le cue de timing doux
 * précède une date absolue. Null si pas de cue ou date illisible.
 */
export function softTimingNotBefore(note: string | undefined): Date | null {
  if (!note?.trim()) return null;
  const cue = note.match(SOFT_TIMING_CUE);
  if (!cue || cue.index == null) return null;
  const after = note.slice(cue.index + cue[0].length);

  const slash = after.match(
    /^\s*(?:le\s+|lundi\s+|mardi\s+|mercredi\s+|jeudi\s+|vendredi\s+|samedi\s+|dimanche\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i,
  );
  if (slash) {
    return parseFrDayMonth(
      Number(slash[1]),
      Number(slash[2]),
      slash[3] ? Number(slash[3]) : undefined,
      "future",
    );
  }

  const iso = after.match(/^\s*(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return parseFrDayMonth(
      Number(iso[3]),
      Number(iso[2]),
      Number(iso[1]),
      "future",
    );
  }

  const named = after.match(
    /^\s*(?:le\s+)?(\d{1,2}|1er)\s+([a-zéûôà]+)(?:\s+(\d{4}))?/i,
  );
  if (named) {
    const dayRaw = named[1].toLowerCase() === "1er" ? 1 : Number(named[1]);
    const month = FR_MONTHS[named[2].toLowerCase()];
    if (month) {
      return parseFrDayMonth(
        dayRaw,
        month,
        named[3] ? Number(named[3]) : undefined,
        "future",
      );
    }
  }

  return null;
}

/** Timing doux encore dans le futur → trop tôt pour le conseil du jour. */
export function hasFutureSoftTiming(note: string | undefined): boolean {
  const d = softTimingNotBefore(note);
  if (!d) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return dayDiff(`${y}-${m}-${day}`) > 0;
}

export function isRelanceStyleText(text: string): boolean {
  return RELANCE_TEXT.test(text);
}

/**
 * Un truc peut entrer dans le conseil du jour (desk / notif) ?
 * - Suivi dont la prochaine relance est encore dans le futur → non
 * - Contacté récemment (note) → non
 * - Libellé type relance + due encore future → trop tôt (due = prochain check)
 * - Intention plannedFor encore future → non (ce n'est pas le jour J)
 * - Note « vers / à partir du / pas avant » avec date future → non
 */
export function isDeskPlanCandidate(t: Thread): boolean {
  if (t.status !== "open") return false;
  if (hasRecentContactNote(t.note)) return false;
  if (hasFutureSoftTiming(t.note)) return false;
  if (t.plannedFor && dayDiff(t.plannedFor) > 0) return false;

  if (t.due) {
    const n = dayDiff(t.due);
    if (t.kind === "suivi" && n > 0) return false;
    if (isRelanceStyleText(t.text) && n > 0) return false;
  }

  return true;
}

export function splitPlanThreads(threads: Thread[]): {
  candidates: Thread[];
  waiting: Thread[];
} {
  const open = threads.filter((t) => t.status === "open");
  const candidates: Thread[] = [];
  const waiting: Thread[] = [];
  for (const t of open) {
    if (isDeskPlanCandidate(t)) candidates.push(t);
    else waiting.push(t);
  }
  return { candidates, waiting };
}

/** La note dit qu'on n'a plus à sortir (en ligne, quelqu'un d'autre, déjà réglé). */
const NO_LONGER_OUTDOOR =
  /plus de sortie|sans (?:avoir à )?bouger|en ligne uniquement|papa (?:prend|gère)|faisable à distance|pas (?:une |de )?sortie/i;

const OUTDOOR_CUE =
  /\b(magasin|papeterie|pharmacie|poste|banque|coffre|shopping|chaussures|supermarch[ée]|courses|d[ée]placement|sortir|sortie|sur place|en magasin|nager|baignade|piscine|place d['’]italie)\b/i;

const OUTDOOR_NOTE =
  /d[ée]placement|sortie physique|pas faisable à distance|en magasin|sur le trajet|n[ée]cessite un d[ée]placement/i;

/** Condition posée dans la note, jamais tranchée — pas un mur, une question. */
const UNVERIFIED_CONDITION =
  /d[èe]s r[ée]ception|d[èe]s que|à v[ée]rifier|une fois arriv[ée]e?|pas encore ouverte|quand j['’]aurai|condition salaire/i;

/** Ce truc exige de sortir : le 15 min bureau ne le portera jamais. */
export function isOutdoorNeed(t: Thread): boolean {
  const blob = `${t.text}\n${t.note ?? ""}`;
  if (NO_LONGER_OUTDOOR.test(blob)) return false;
  if (t.text.trim().toLowerCase() === "courses") return true;
  return OUTDOOR_CUE.test(blob) || OUTDOOR_NOTE.test(t.note ?? "");
}

/** Une condition bloque le truc sur le papier, mais on ne l'a jamais demandée. */
export function hasUnverifiedCondition(t: Thread): boolean {
  if (hasFutureSoftTiming(t.note)) return false;
  return UNVERIFIED_CONDITION.test(`${t.note ?? ""}\n${t.text}`);
}

export function splitDeskBuckets(candidates: Thread[]): {
  sitting: Thread[];
  outdoor: Thread[];
  conditions: Thread[];
} {
  const outdoor = candidates.filter(isOutdoorNeed);
  const outdoorIds = new Set(outdoor.map((t) => t.id));
  const conditions = candidates.filter(
    (t) => hasUnverifiedCondition(t) && !outdoorIds.has(t.id),
  );
  const parked = new Set([
    ...outdoor.map((t) => t.id),
    ...conditions.map((t) => t.id),
  ]);
  const sitting = candidates.filter((t) => !parked.has(t.id));
  return { sitting, outdoor, conditions };
}

/** Ligne telle que le prompt plan la voit (diagnostic + render serveur). */
export function formatDeskPlanLine(t: Thread): string {
  const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
  const effort = t.effort ? ` · effort ${t.effort}` : "";
  const note = t.note ? ` · liste/contexte: ${t.note}` : "";
  const seen = t.touchedAt
    ? ageLabel(t.touchedAt, "revu")
    : " · jamais entamé";
  return `- [${kind}] ${t.text}${dueLabel(t.due, "plan")}${intentionLabel(t.plannedFor)}${ageLabel(t.createdAt, "déposé")}${seen}${effort}${note}`;
}

export interface PlanViewSnapshot {
  candidates: string[];
  waiting: string[];
  outdoor: string[];
  conditions: string[];
}

export function planViewFromDebug(d: {
  candidates?: unknown;
  waiting?: unknown;
  outdoor?: unknown;
  conditions?: unknown;
}): PlanViewSnapshot | null {
  if (!Array.isArray(d.candidates) || !Array.isArray(d.waiting)) return null;
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    candidates: strs(d.candidates),
    waiting: strs(d.waiting),
    outdoor: strs(d.outdoor),
    conditions: strs(d.conditions),
  };
}

/** Snapshot déterministe — ce que le filtre met sous les yeux de l'IA. */
export function buildPlanViewSnapshot(threads: Thread[]): PlanViewSnapshot {
  const open = threads.filter(
    (t) => t.status === "open" && !isContainerThread(t),
  );
  const { candidates, waiting } = splitPlanThreads(open);
  const { sitting, outdoor, conditions } = splitDeskBuckets(candidates);
  return {
    candidates: sitting.map(formatDeskPlanLine),
    outdoor: outdoor.map(formatDeskPlanLine),
    conditions: conditions.map(formatDeskPlanLine),
    waiting: waiting.map(formatDeskPlanLine),
  };
}
