import type { UsageWeek as Week } from "@/lib/usage";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Semaine calme : une ligne + les réglés, sans calendrier. */
export default function UsageWeek({ week }: { week: Week }) {
  const maxDone = Math.max(1, ...week.doneDays);

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
            : ""}
        </span>
      </div>

      {week.doneWeek > 0 && (
        <>
          <div className="mt-3 mb-1.5 flex items-baseline justify-between">
            <span className="text-sm text-ink">
              <span className="text-teal">✓</span>{" "}
              {week.doneToday > 1
                ? `${week.doneToday} réglés aujourd'hui`
                : `${week.doneToday} réglé aujourd'hui`}
            </span>
            <span className="text-xs text-muted">
              {week.doneWeek} cette semaine
            </span>
          </div>
          <div className="flex h-12 items-end gap-1.5">
            {week.doneDays.map((c, i) => (
              <div key={i} className="flex flex-1 flex-col items-center">
                <div
                  className={`w-full rounded-md transition-all ${
                    i === week.todayIdx
                      ? "bg-teal"
                      : c > 0
                        ? "bg-teal-soft"
                        : "bg-sink"
                  }`}
                  style={{ height: `${6 + (c / maxDone) * 32}px` }}
                  title={`${c} réglé${c > 1 ? "s" : ""}`}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
