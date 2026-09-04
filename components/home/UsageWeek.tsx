import type { UsageWeek as Week } from "@/lib/usage";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

function todayLine(week: Week): string {
  if (week.doneToday > 0 && week.movedToday > week.doneToday) {
    const extra = week.movedToday - week.doneToday;
    return `${plural(week.doneToday, "réglé", "réglés")} · avancé sur ${extra}`;
  }
  if (week.doneToday > 0) {
    return `${plural(week.doneToday, "réglé", "réglés")} aujourd'hui`;
  }
  if (week.movedToday > 0) {
    return `avancé sur ${week.movedToday} aujourd'hui`;
  }
  return "";
}

/** Semaine calme : une ligne + ce qui a bougé, sans calendrier. */
export default function UsageWeek({ week }: { week: Week }) {
  const bars = week.movedDays;
  const maxBar = Math.max(1, ...bars);
  const showBars = week.movedWeek > 0 || week.doneWeek > 0;
  const today = todayLine(week);

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">
          {plural(week.passages, "passage", "passages")} cette semaine
        </span>
        <span className="text-xs text-muted">
          {plural(week.sessions, "séance", "séances")}
          {" · "}
          {week.minutes} min
          {week.doneWeek > 0
            ? ` · ${plural(week.doneWeek, "réglé", "réglés")}`
            : week.movedWeek > 0
              ? ` · avancé sur ${week.movedWeek}`
              : ""}
        </span>
      </div>

      {showBars ? (
        <>
          {today ? (
            <div className="mt-3 mb-1.5 flex items-baseline justify-between">
              <span className="text-sm text-ink">
                <span className="text-teal">✓</span> {today}
              </span>
              <span className="text-xs text-muted">
                {week.doneWeek > 0
                  ? `${week.doneWeek} réglé${week.doneWeek > 1 ? "s" : ""} cette semaine`
                  : `${week.movedWeek} cette semaine`}
              </span>
            </div>
          ) : (
            <div className="mt-3" />
          )}
          <div className="flex h-12 items-end gap-1.5">
            {bars.map((c, i) => (
              <div key={i} className="flex flex-1 flex-col items-center">
                <div
                  className={`w-full rounded-md transition-all ${
                    i === week.todayIdx
                      ? "bg-teal"
                      : c > 0
                        ? "bg-teal-soft"
                        : "bg-sink"
                  }`}
                  style={{ height: `${6 + (c / maxBar) * 32}px` }}
                  title={
                    c > 0
                      ? `${c} avancé${c > 1 ? "s" : ""}`
                      : "rien ce jour-là"
                  }
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
