"use client";

import type { AdminActivityDay, AdminDayBand } from "@/lib/admin-user-detail";

export function ActivityWeightStrip({
  days,
}: {
  days: AdminActivityDay[];
}) {
  const max = Math.max(...days.map((d) => d.weightMin), 1);
  const weeks: AdminActivityDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[280px] flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const intensity = d.weightMin / max;
              const title = d.active
                ? `${d.day} — ~${d.weightMin} min pondérées`
                : d.day;
              return (
                <div
                  key={d.day}
                  title={title}
                  className="aspect-square rounded-[4px] border border-line/60"
                  style={{
                    backgroundColor: d.active
                      ? `color-mix(in srgb, var(--color-teal) ${Math.round(intensity * 70 + 12)}%, transparent)`
                      : undefined,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">
        90 derniers jours — intensité = temps pondéré (dwell + séances + actions)
      </p>
    </div>
  );
}

const KIND_COLORS: Record<string, string> = {
  session: "bg-teal",
  event: "bg-sink border border-line",
  thread_done: "bg-amber/30",
  feedback: "bg-teal-soft",
  api: "bg-muted/20",
};

export function WeightedDayFrise({
  bands,
  onSelectDay,
  selectedDay,
}: {
  bands: AdminDayBand[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const max = Math.max(...bands.map((b) => b.totalWeightMin), 1);
  const top = bands.slice(0, 21);

  return (
    <div className="flex flex-col gap-2">
      {top.map((band) => {
        const pct = Math.round((band.totalWeightMin / max) * 100);
        const selected = selectedDay === band.day;
        return (
          <button
            key={band.day}
            type="button"
            onClick={() => onSelectDay(selected ? null : band.day)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              selected
                ? "border-teal bg-teal-soft/40"
                : "border-line bg-surface hover:border-teal/30"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-ink">
                  {band.label}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {band.entries.length} événement
                  {band.entries.length > 1 ? "s" : ""}
                  {band.sessionMin > 0
                    ? ` · ${band.sessionMin} min séance`
                    : ""}
                  {band.dwellMin > 0 ? ` · ${band.dwellMin} min app` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-lg font-semibold text-ink">
                  {band.totalWeightMin}
                </div>
                <div className="text-[10px] text-faint">min pond.</div>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sink">
              <div
                className="h-full rounded-full bg-teal transition-all"
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
            {selected ? (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-line/60 pt-3">
                {band.entries.map((e, i) => (
                  <div
                    key={`${e.at}-${i}`}
                    className="flex items-start gap-2 text-[12px]"
                  >
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        KIND_COLORS[e.kind] ?? "bg-faint"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{e.label}</span>
                      {e.detail ? (
                        <span className="text-muted"> — {e.detail}</span>
                      ) : null}
                      <span className="ml-1 text-faint">
                        ({e.weightMin < 1
                          ? e.weightMin.toFixed(1)
                          : Math.round(e.weightMin)}{" "}
                        min)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
