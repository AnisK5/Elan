/** Labels neutres pour les threads — pas de lane « prio / secondaire ». */

export function dayDiff(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function dueLabel(iso?: string, style: "session" | "plan" = "session"): string {
  if (!iso) return "";
  const n = dayDiff(iso);
  if (style === "plan") {
    if (n < 0) return ` · fenêtre dépassée depuis ${-n}j`;
    if (n === 0) return " · fenêtre se ferme aujourd'hui";
    if (n === 1) return " · fenêtre se ferme demain";
    return ` · fenêtre ouverte encore ${n}j`;
  }
  if (n < 0) return ` · échéance passée depuis ${-n}j`;
  if (n === 0) return " · échéance aujourd'hui";
  if (n === 1) return " · échéance demain";
  return ` · échéance dans ${n}j`;
}

/** Intention de jour (plannedFor) — un signal parmi d'autres, pas un statut VIP. */
export function intentionLabel(iso?: string): string {
  if (!iso) return "";
  const n = dayDiff(iso);
  if (n < 0) return ` · intention : prévu il y a ${-n}j`;
  if (n === 0) return " · intention : prévu aujourd'hui";
  if (n === 1) return " · intention : prévu demain";
  return ` · intention : prévu dans ${n}j`;
}

export function ageLabel(iso: string, verb: string): string {
  const n = Math.max(0, -dayDiff(iso));
  if (n === 0) return ` · ${verb} aujourd'hui`;
  if (n === 1) return ` · ${verb} hier`;
  return ` · ${verb} il y a ${n}j`;
}
