"use client";

export function BarChart({
  rows,
  valueKey,
  labelKey,
  suffix = "",
  maxBars = 12,
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  suffix?: string;
  maxBars?: number;
}) {
  const slice = rows.slice(0, maxBars);
  const max = Math.max(...slice.map((r) => Number(r[valueKey]) || 0), 1);

  return (
    <div className="flex flex-col gap-2">
      {slice.map((row, i) => {
        const val = Number(row[valueKey]) || 0;
        const pct = Math.round((val / max) * 100);
        return (
          <div key={i} className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
            <span className="truncate text-[11px] text-muted">
              {String(row[labelKey])}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-sink">
              <div
                className="h-full rounded-full bg-teal transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-ink">
              {val.toLocaleString("fr-FR")}
              {suffix}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function HourHeatmap({
  rows,
}: {
  rows: { hour: number; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {rows.map((r) => {
        const intensity = r.count / max;
        return (
          <div
            key={r.hour}
            title={`${r.hour}h — ${r.count} séance${r.count > 1 ? "s" : ""}`}
            className="flex flex-col items-center gap-1 rounded-lg border border-line px-1 py-2"
            style={{
              backgroundColor:
                r.count === 0
                  ? undefined
                  : `color-mix(in srgb, var(--color-teal) ${Math.round(intensity * 55 + 8)}%, transparent)`,
            }}
          >
            <span className="text-[10px] font-medium text-muted">{r.hour}h</span>
            <span className="text-[11px] tabular-nums text-ink">{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MetricGrid({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-line bg-surface px-3 py-3"
        >
          <div className="text-[11px] uppercase tracking-wide text-faint">
            {item.label}
          </div>
          <div className="mt-1 font-display text-xl font-semibold text-ink">
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-0.5 text-[11px] text-faint">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
