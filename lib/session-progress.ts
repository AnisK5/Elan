import type { Thread } from "./types";

export function progressDuringSession(
  threads: Thread[],
  startedAt: string,
): { done: number; advanced: number } {
  let done = 0;
  let advanced = 0;
  for (const t of threads) {
    const closed = t.status === "done" && t.doneAt && t.doneAt >= startedAt;
    if (closed) {
      done++;
      continue;
    }
    if (t.touchedAt && t.touchedAt >= startedAt) advanced++;
  }
  return { done, advanced };
}

export function wrapUpHeadline(done: number, advanced: number): {
  lead: string;
  rest: string;
  celebrate: boolean;
} {
  if (done > 0 && advanced > 0) {
    return {
      lead: `${done} truc${done > 1 ? "s" : ""} réglé${done > 1 ? "s" : ""} · on a avancé sur ${advanced} autre${advanced > 1 ? "s" : ""}`,
      rest: "Le reste attend sagement, tu n'as pas à y penser.",
      celebrate: true,
    };
  }
  if (done > 0) {
    return {
      lead: `${done} truc${done > 1 ? "s" : ""} réglé${done > 1 ? "s" : ""}`,
      rest: "Le reste attend sagement, tu n'as pas à y penser.",
      celebrate: true,
    };
  }
  if (advanced > 0) {
    return {
      lead: `on a avancé sur ${advanced} truc${advanced > 1 ? "s" : ""}`,
      rest: "Ce n'est pas fini, et c'est déjà du vrai travail. Le reste attend sagement.",
      celebrate: true,
    };
  }
  return {
    lead: "",
    rest: "Le reste attend sagement — tu n'as pas à y penser jusqu'à demain.",
    celebrate: false,
  };
}

export function isSameCalendarDay(iso: string, at = new Date()): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return (
    d.getFullYear() === at.getFullYear() &&
    d.getMonth() === at.getMonth() &&
    d.getDate() === at.getDate()
  );
}
