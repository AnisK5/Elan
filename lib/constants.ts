/** Réglages globaux de l'app (durées, cache plan, reprise de séance). */

// Bump à chaque changement du prompt de reco (app/api/plan) : invalide le cache local.
export const PLAN_VERSION = 38;

export const DURATIONS = [5, 15, 30, 50] as const;

export type DurationMin = (typeof DURATIONS)[number];

export function normalizeDuration(n: number): DurationMin {
  return (DURATIONS as readonly number[]).includes(n) ? (n as DurationMin) : 15;
}

// Durée nominale pour les séances dehors (timer masqué, sert au log).
export const OUTDOOR_DURATION = 30;

// Au-delà, une séance interrompue n'est plus reprise automatiquement.
export const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;
