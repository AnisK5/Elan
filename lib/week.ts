// Constantes partagées de la vue semaine (grain lâche : demi-journées + soir).
// Utilisées côté API (/api/week) et côté UI (WeekView).

export const DAY_KEYS = [
  "lun",
  "mar",
  "mer",
  "jeu",
  "ven",
  "sam",
  "dim",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_NAMES: Record<DayKey, string> = {
  lun: "lundi",
  mar: "mardi",
  mer: "mercredi",
  jeu: "jeudi",
  ven: "vendredi",
  sam: "samedi",
  dim: "dimanche",
};

export const PARTS = ["matin", "aprem", "soir"] as const;
export type Part = (typeof PARTS)[number];

export const PART_NAMES: Record<Part, string> = {
  matin: "Matin",
  aprem: "Après-midi",
  soir: "Soir",
};

export const ALL_SLOTS = new Set<string>(
  DAY_KEYS.flatMap((d) => PARTS.map((p) => `${d}-${p}`)),
);

// Index du jour courant dans DAY_KEYS (lundi = 0).
export function todayDayIdx(): number {
  return (new Date().getDay() + 6) % 7;
}

export interface WeekSlot {
  slot: string; // ex. "lun-matin"
  projectId: string;
  rationale: string;
}

export interface WeekPlan {
  intro: string;
  slots: WeekSlot[];
}
