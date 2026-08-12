/** Graphique « victoires de la semaine » (trucs bouclés par jour). */

export default function WeekMomentum({
  days,
  todayIdx,
  doneToday,
  doneWeek,
}: {
  days: number[];
  todayIdx: number;
  doneToday: number;
  doneWeek: number;
}) {
  const max = Math.max(1, ...days);
  const labels = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-sm text-ink">
          <span className="text-teal">✓</span>{" "}
          <b>{doneToday}</b>{" "}
          {`${doneToday > 1 ? "réglés" : "réglé"} aujourd'hui`}
        </span>
        <span className="text-xs text-muted">{doneWeek} cette semaine</span>
      </div>
      <div className="flex h-12 items-end gap-1.5">
        {days.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-md transition-all ${
                i === todayIdx
                  ? "bg-teal"
                  : c > 0
                    ? "bg-teal-soft"
                    : "bg-sink"
              }`}
              style={{ height: `${6 + (c / max) * 32}px` }}
              title={`${c} réglé${c > 1 ? "s" : ""}`}
            />
            <span
              className={`text-[9px] ${
                i === todayIdx ? "font-semibold text-teal" : "text-faint"
              }`}
            >
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
