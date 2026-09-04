/** Charge des fenêtres (DL) — calcul déterministe pour le conseil du jour. */

import { isContainerThread } from "./entretiens";
import { snapDeskMins, type DayPlanMoment } from "./day-plan";
import { splitPlanThreads } from "./plan-candidates";
import { dayDiff } from "./thread-labels";
import type { Effort, Thread } from "./types";

export type WindowUrgency = "overdue" | "today" | "tomorrow";

export type DeadlineWindow = {
  id: string;
  text: string;
  due: string;
  days: number;
  mins: number;
  urgency: WindowUrgency;
};

/** Effort → minutes de capacité à prévoir. */
export function effortMins(effort?: Effort | null): number {
  switch (effort) {
    case "S":
      return 15;
    case "M":
      return 30;
    case "L":
      return 50;
    default:
      return 25;
  }
}

function urgencyOf(days: number): WindowUrgency | null {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return null;
}

function urgencyLabel(u: WindowUrgency, days: number): string {
  if (u === "overdue") {
    const n = Math.abs(days);
    return n === 1 ? "en retard d'1j" : `en retard de ${n}j`;
  }
  if (u === "today") return "aujourd'hui";
  return "demain";
}

/**
 * Fenêtres ≤ demain parmi les candidats du conseil
 * (pas les relances en attente, pas les containers).
 */
export function deadlineWindows(threads: Thread[]): {
  items: DeadlineWindow[];
  totalMins: number;
  hardCount: number;
} {
  const open = threads.filter(
    (t) => t.status === "open" && !isContainerThread(t),
  );
  const { candidates } = splitPlanThreads(open);
  const items: DeadlineWindow[] = [];

  for (const t of candidates) {
    if (!t.due) continue;
    const days = dayDiff(t.due);
    const urgency = urgencyOf(days);
    if (!urgency) continue;
    items.push({
      id: t.id,
      text: t.text.trim(),
      due: t.due,
      days,
      mins: effortMins(t.effort),
      urgency,
    });
  }

  items.sort((a, b) => a.days - b.days || a.text.localeCompare(b.text, "fr"));

  const totalMins = items.reduce((sum, i) => sum + i.mins, 0);
  const hardCount = items.filter(
    (i) => i.urgency === "overdue" || i.urgency === "today",
  ).length;

  return { items, totalMins, hardCount };
}

/** Capacité offerte par les moments de la carte. */
export function offeredCapacityMins(moments: DayPlanMoment[]): number {
  return moments.reduce((sum, m) => {
    if (m.mode === "sortie" || m.mode === "courses") return sum + 30;
    if (typeof m.mins === "number" && m.mins > 0) {
      return sum + snapDeskMins(m.mins);
    }
    return sum + 15;
  }, 0);
}

/** Bloc injecté dans le prompt plan — chiffres, pas prose libre. */
export function renderDeadlineCharge(threads: Thread[]): string {
  const { items, totalMins, hardCount } = deadlineWindows(threads);
  if (items.length === 0) {
    return `CHARGE FENÊTRES (calcul) : aucune échéance ≤ demain parmi les candidats du conseil.
→ forme libre (petit pas OK). Point 5 du why : « déborde ? NON — rien de serré ».`;
  }

  const lines = items.map(
    (i) =>
      `- « ${i.text} » · ${urgencyLabel(i.urgency, i.days)} · ~${i.mins} min`,
  );

  return `CHARGE FENÊTRES (calcul déterministe — pas une estimation libre) :
${lines.join("\n")}
TOTAL ≈ ${totalMins} min · ${hardCount} à traiter aujourd'hui ou déjà en retard.

RÈGLE DURE — GARDIEN DES FENÊTRES :
1) Les moments du jour DOIVENT offrir assez de capacité (somme des mins desk/régulier + ~30 min par sortie) pour couvrir ce TOTAL (±10 min). Sinon : allonge (30/50), dédouble, ou passe à 3 moments.
2) Chaque fenêtre « aujourd'hui » / « en retard » doit apparaître dans AU MOINS un label de moment (ou être explicitement reportée en why avec une raison lieu/contexte — pas oubliée).
3) Point 5 du why : réponds « déborde ? NON — parce que [forme exacte : ex. 50 + 30, ou 3×15] ». « OK au rythme actuel » est FAUX si la capacité < TOTAL.
4) Tu n'es pas obligée de tout coller sur UN bouton : plusieurs courtes séances dans la journée = OK, et souvent mieux qu'une seule longue qui ne démarre jamais.`;
}
