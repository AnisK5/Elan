import type { Thread } from "./types";

/** Date de clôture pour les stats — figée, pas la dernière retouche. */
export function completionAt(t: Thread): string | undefined {
  return t.doneAt ?? t.touchedAt;
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
  const start = new Date(dayStartMs);
  start.setHours(0, 0, 0, 0);
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const days = Array(7).fill(0) as number[];
  const todayIdx = (start.getDay() + 6) % 7;

  for (const t of threads) {
    if (t.status !== "done") continue;
    const at = completionAt(t);
    if (!at) continue;
    const ts = new Date(at);
    ts.setHours(0, 0, 0, 0);
    const diff = Math.round((ts.getTime() - monday.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) days[diff]++;
  }

  return {
    days,
    todayIdx,
    doneToday: days[todayIdx],
    doneWeek: days.reduce((a, b) => a + b, 0),
  };
}
