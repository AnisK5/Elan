import type { Thread } from "./types";

/** Date de clôture pour les stats — figée, pas la dernière retouche. */
export function completionAt(t: Thread): string | undefined {
  return t.doneAt ?? t.touchedAt;
}

/** Jour où ça a bougé : clôturé, ou travaillé sans clôturer. */
export function movementAt(t: Thread): string | undefined {
  if (t.status === "done") return t.doneAt ?? t.touchedAt;
  return t.touchedAt;
}

function countsThisWeek(
  threads: Thread[],
  dayStartMs: number,
  when: (t: Thread) => string | undefined,
  include: (t: Thread) => boolean,
): {
  days: number[];
  todayIdx: number;
  today: number;
  week: number;
} {
  const start = new Date(dayStartMs);
  start.setHours(0, 0, 0, 0);
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const days = Array(7).fill(0) as number[];
  const todayIdx = (start.getDay() + 6) % 7;

  for (const t of threads) {
    if (!include(t)) continue;
    const at = when(t);
    if (!at) continue;
    const ts = new Date(at);
    ts.setHours(0, 0, 0, 0);
    const diff = Math.round((ts.getTime() - monday.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) days[diff]++;
  }

  return {
    days,
    todayIdx,
    today: days[todayIdx],
    week: days.reduce((a, b) => a + b, 0),
  };
}

export function doneCountsThisWeek(
  threads: Thread[],
  dayStartMs: number,
): {
  days: number[];
  todayIdx: number;
  doneToday: number;
  doneWeek: number;
} {
  const c = countsThisWeek(
    threads,
    dayStartMs,
    completionAt,
    (t) => t.status === "done",
  );
  return {
    days: c.days,
    todayIdx: c.todayIdx,
    doneToday: c.today,
    doneWeek: c.week,
  };
}

export function movedCountsThisWeek(
  threads: Thread[],
  dayStartMs: number,
): {
  days: number[];
  todayIdx: number;
  movedToday: number;
  movedWeek: number;
} {
  const c = countsThisWeek(threads, dayStartMs, movementAt, () => true);
  return {
    days: c.days,
    todayIdx: c.todayIdx,
    movedToday: c.today,
    movedWeek: c.week,
  };
}
