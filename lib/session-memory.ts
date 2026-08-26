import type { SessionLog, Thread } from "./types";
import {
  ageLabel,
  dayDiff,
  dueLabel,
  intentionLabel,
} from "./thread-labels";
import { splitPlanThreads } from "./plan-candidates";

export function sessionsToday(sessions: SessionLog[]): SessionLog[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return sessions
    .filter((s) => Date.parse(s.date) >= start.getTime())
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function openingExcerpt(log: SessionLog): string {
  const opening = log.transcript.find(
    (m) => m.role === "assistant" && m.content.trim(),
  );
  if (!opening) return "(programme non enregistré)";
  return opening.content.trim().slice(0, 450).replace(/\s+/g, " ");
}

function intentionShort(iso: string): string {
  const n = dayDiff(iso);
  if (n < 0) return ` · intention passée (${-n}j)`;
  if (n === 0) return " · intention aujourd'hui";
  return "";
}

export function renderThreadLine(
  t: Thread,
  style: "session" | "plan",
): string {
  const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
  const effort = t.effort ? ` · effort ${t.effort}` : "";
  const energy = t.energy ? ` · énergie ${t.energy}` : "";
  const age = ageLabel(t.createdAt, "déposé");
  const seen =
    t.touchedAt ?
      ageLabel(t.touchedAt, "revu")
    : style === "session" ?
      " · jamais entamé"
    : " · jamais entamé";
  const note =
    t.note ?
      style === "session" ?
        `\n    contexte : ${t.note}`
      : ` · contexte: ${t.note}`
    : "";
  return `- [${kind}] ${t.text}${dueLabel(t.due, style)}${intentionLabel(t.plannedFor)}${age}${seen}${effort}${energy}${note}`;
}

export function renderOpenThreads(
  threads: Thread[],
  style: "session" | "plan",
  emptyMessage: string,
): string {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return emptyMessage;

  const overdueDue = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const header =
    style === "session" ?
      `${open.length} trucs ouverts (${overdueDue} échéances passées)`
    : `${open.length} trucs ouverts (${overdueDue} dont la fenêtre est passée)`;

  return `${header} :\n${open.map((t) => renderThreadLine(t, style)).join("\n")}`;
}

/** Séance bureau : les fils trop tôt ne sont pas un menu. */
export function renderDeskSessionThreads(
  threads: Thread[],
  emptyMessage: string,
): string {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return emptyMessage;
  const { candidates, waiting } = splitPlanThreads(open);
  const overdueDue = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const header = `${open.length} trucs ouverts (${overdueDue} échéances passées)`;
  const now =
    candidates.length > 0
      ? `POUR AUJOURD'HUI :\n${candidates.map((t) => renderThreadLine(t, "session")).join("\n")}`
      : "POUR AUJOURD'HUI : (rien de mûr — ne fabrique pas de travail).";
  const later =
    waiting.length > 0
      ? `\n\nPAS POUR AUJOURD'HUI (trop tôt — « vers / à partir du », relance future, contacté récemment). NE PROPOSE PAS, même si on vient d'écarter un autre truc :\n${waiting.map((t) => renderThreadLine(t, "session")).join("\n")}`
      : "";
  return `${header}.\n\n${now}${later}`;
}

/** Ce qui a bougé — ou stagné — depuis la dernière séance du jour. */
export function renderSessionContinuity(
  priorSessions: SessionLog[],
  threads: Thread[],
): string {
  const today = sessionsToday(priorSessions);
  if (today.length === 0) return "";

  const last = today[0];
  const since = Date.parse(last.date);
  const at = new Date(last.date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const open = threads.filter((t) => t.status === "open");
  const doneSince = threads.filter(
    (t) =>
      t.status === "done" && t.touchedAt && Date.parse(t.touchedAt) >= since,
  );
  const revuSince = open.filter(
    (t) => t.touchedAt && Date.parse(t.touchedAt) >= since,
  );
  const pasRevu = open.filter((t) => {
    if (!t.touchedAt) return Date.parse(t.createdAt) < since;
    return Date.parse(t.touchedAt) < since;
  });

  const stagnantLines = pasRevu
    .slice(0, 10)
    .map((t) => {
      const age = ageLabel(t.createdAt, "déposé");
      const intent = t.plannedFor ? intentionShort(t.plannedFor) : "";
      const note = t.note ? ` — ${t.note.slice(0, 80)}` : "";
      return `  · ${t.text}${age}${intent}${note}`;
    })
    .join("\n");

  const doneLine =
    doneSince.length > 0 ?
      doneSince.map((t) => t.text).join(", ")
    : "rien de bouclé";

  const revuLine =
    revuSince.length > 0 ?
      revuSince.map((t) => t.text).join(", ")
    : "aucun truc revu";

  return `

CONTINUITÉ — DERNIÈRE SÉANCE AUJOURD'HUI (${at}, ${last.durationMin} min) :
Programme proposé alors : « ${openingExcerpt(last)} »

Depuis :
- bouclé(s) : ${doneLine}
- revu(s) sans clôturer : ${revuLine}
- pas revu(s) depuis cette séance :
${stagnantLines || "  · (tous les trucs ouverts ont été revus)"}

Compose CETTE séance en tenant compte de ce bilan : si un truc important stagnait déjà après la dernière composition, c'est un signal à intégrer — pas une obligation aveugle, mais ne le laisse pas encore une fois au fond sans raison (contexte, conséquence, créneau).`;
}
