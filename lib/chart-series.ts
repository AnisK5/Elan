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

/** Clés heure Paris YYYY-MM-DDTHH sur les N dernières heures. */
export function listParisHourKeys(hoursBack: number, end = new Date()): string[] {
  const out: string[] = [];
  const n = Math.min(14 * 24, Math.max(1, hoursBack));
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(end.getTime() - i * 3_600_000);
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(t);
    const pick = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    out.push(
      `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}`,
    );
  }
  return out;
}

export function parisHourLabelFromKey(hourKey: string): string {
  const [date, hour] = hourKey.split("T");
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)} ${hour}h`;
}

export function fillTokenDays<
  T extends {
    day: string;
    input: number;
    output: number;
    total: number;
    costUsd: number;
    costEur: number;
  },
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

  for (let n = 0; n < 14 * 24; n++) {
    const key = `${date}T${String(hour).padStart(2, "0")}`;
    const v = values.get(key);
    out.push({
      hourKey: key,
      hourLabel: parisHourLabelFromKey(key),
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
