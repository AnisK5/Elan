/** Remplit une série jour/heure pour un axe temps continu (zéros inclus). */

export function listUtcDays(daysBack: number, end = new Date()): string[] {
  const out: string[] = [];
  const endUtc = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(endUtc.getTime() - i * 86_400_000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

export function fillTokenDays<
  T extends { day: string; input: number; output: number; total: number; costUsd: number; costEur: number },
>(rows: T[], daysBack: number, end = new Date()): T[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  return listUtcDays(daysBack, end).map((day) => {
    const hit = map.get(day);
    if (hit) return hit;
    return {
      day,
      input: 0,
      output: 0,
      total: 0,
      costUsd: 0,
      costEur: 0,
    } as T;
  });
}

/** hourKey = YYYY-MM-DDTHH (Paris). Remplit de from à to inclus. */
export function fillHourKeys(
  keys: string[],
  values: Map<string, { calls: number; total: number; costEur: number }>,
): Array<{
  hourKey: string;
  hourLabel: string;
  calls: number;
  total: number;
  costEur: number;
}> {
  if (keys.length === 0) return [];
  const sorted = [...keys].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const out: Array<{
    hourKey: string;
    hourLabel: string;
    calls: number;
    total: number;
    costEur: number;
  }> = [];

  let [date, hourStr] = first.split("T");
  let hour = Number(hourStr);
  const endParts = last.split("T");
  const endDate = endParts[0];
  const endHour = Number(endParts[1]);

  const label = (d: string, h: number) => {
    const [, m, day] = d.split("-");
    return `${Number(day)}/${Number(m)} ${String(h).padStart(2, "0")}h`;
  };

  // safety: max 14 days of hours
  for (let n = 0; n < 14 * 24; n++) {
    const key = `${date}T${String(hour).padStart(2, "0")}`;
    const v = values.get(key);
    out.push({
      hourKey: key,
      hourLabel: label(date, hour),
      calls: v?.calls ?? 0,
      total: v?.total ?? 0,
      costEur: v?.costEur ?? 0,
    });
    if (date === endDate && hour === endHour) break;
    hour += 1;
    if (hour >= 24) {
      hour = 0;
      const [y, m, d] = date.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      date = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return out;
}
