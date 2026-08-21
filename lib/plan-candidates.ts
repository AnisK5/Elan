import type { Thread } from "./types";
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseFrDayMonth(
  day: number,
  month: number,
  year?: number,
): Date | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const today = startOfToday();
  let y = year;
  if (y == null) {
    y = today.getFullYear();
    const candidate = new Date(y, month - 1, day);
    candidate.setHours(0, 0, 0, 0);
    // Date future dans l'année civile → probablement l'année d'avant (ex. 31/12 lu en janv.).
    if (candidate.getTime() > today.getTime() + 2 * 86_400_000) {
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

export function isRelanceStyleText(text: string): boolean {
  return RELANCE_TEXT.test(text);
}

/**
 * Un truc peut entrer dans le conseil du jour (desk / notif) ?
 * - Suivi dont la prochaine relance est encore dans le futur → non
 * - Contacté récemment (note) → non
 * - Libellé type relance + due encore future → trop tôt (due = prochain check)
 */
export function isDeskPlanCandidate(t: Thread): boolean {
  if (t.status !== "open") return false;
  if (hasRecentContactNote(t.note)) return false;

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
}

/** Snapshot déterministe — ce que le filtre met sous les yeux de l'IA. */
export function buildPlanViewSnapshot(threads: Thread[]): PlanViewSnapshot {
  const open = threads.filter((t) => t.status === "open");
  const { candidates, waiting } = splitPlanThreads(open);
  return {
    candidates: candidates.map(formatDeskPlanLine),
    waiting: waiting.map(formatDeskPlanLine),
  };
}
