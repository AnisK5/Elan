"use client";

import { useId, useMemo, useState } from "react";
import { formatEur } from "@/lib/anthropic-pricing";

export type ChartPoint = {
  label: string;
  /** Axe principal (tokens, appels…) */
  value: number;
  /** Coût en € — affiché en courbe / labels */
  costEur?: number;
};

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const f = n / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function shortNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

/** Histogramme vertical + courbe € (double axe). */
export function TimeSeriesChart({
  points,
  valueLabel = "Tokens",
  height = 220,
  maxPoints = 48,
}: {
  points: ChartPoint[];
  valueLabel?: string;
  height?: number;
  maxPoints?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const slice = points.slice(-maxPoints);
  const w = 640;
  const pad = { t: 16, r: 44, b: 36, l: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const maxV = niceMax(Math.max(...slice.map((p) => p.value), 1));
  const maxC = niceMax(
    Math.max(...slice.map((p) => p.costEur ?? 0), 0.01),
  );
  const hasCost = slice.some((p) => (p.costEur ?? 0) > 0);

  const n = Math.max(slice.length, 1);
  const gap = n > 24 ? 2 : n > 12 ? 4 : 6;
  const barW = Math.max(3, (innerW - gap * (n - 1)) / n);

  const bars = slice.map((p, i) => {
    const x = pad.l + i * (barW + gap);
    const h = Math.max(1, (p.value / maxV) * innerH);
    const y = pad.t + innerH - h;
    return { ...p, x, y, h, i };
  });

  const linePts = hasCost
    ? bars
        .map((b) => {
          const cx = b.x + barW / 2;
          const cy =
            pad.t + innerH - ((b.costEur ?? 0) / maxC) * innerH;
          return `${cx},${cy}`;
        })
        .join(" ")
    : "";

  const areaD = hasCost
    ? (() => {
        const pts = bars.map((b) => {
          const cx = b.x + barW / 2;
          const cy =
            pad.t + innerH - ((b.costEur ?? 0) / maxC) * innerH;
          return [cx, cy] as const;
        });
        if (pts.length === 0) return "";
        const first = pts[0];
        const last = pts[pts.length - 1];
        const top = pts.map(([x, y]) => `${x},${y}`).join(" L ");
        return `M ${first[0]},${pad.t + innerH} L ${top} L ${last[0]},${pad.t + innerH} Z`;
      })()
    : "";

  const tip = hover != null ? bars[hover] : null;
  const labelStep = n > 20 ? Math.ceil(n / 8) : n > 10 ? 2 : 1;

  return (
    <div className="relative w-full">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal" />
          {valueLabel}
        </span>
        {hasCost ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-amber" />
            Coût (€)
          </span>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${valueLabel} et coût dans le temps`}
      >
        <defs>
          <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-amber)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-amber)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={pad.l - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--color-faint)"
                fontSize="9"
              >
                {shortNum(maxV * t)}
              </text>
              {hasCost ? (
                <text
                  x={w - pad.r + 6}
                  y={y + 3}
                  textAnchor="start"
                  fill="var(--color-amber)"
                  fontSize="9"
                >
                  {formatEur(maxC * t)}
                </text>
              ) : null}
            </g>
          );
        })}
        {bars.map((b) => (
          <rect
            key={b.i}
            x={b.x}
            y={b.y}
            width={barW}
            height={b.h}
            rx={Math.min(3, barW / 2)}
            fill="var(--color-teal)"
            opacity={hover == null || hover === b.i ? 0.92 : 0.35}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setHover(b.i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hasCost && areaD ? (
          <path d={areaD} fill={`url(#${gid}-area)`} pointerEvents="none" />
        ) : null}
        {hasCost && linePts ? (
          <polyline
            points={linePts}
            fill="none"
            stroke="var(--color-amber)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        ) : null}
        {hasCost
          ? bars.map((b) => {
              const cx = b.x + barW / 2;
              const cy =
                pad.t + innerH - ((b.costEur ?? 0) / maxC) * innerH;
              return (
                <circle
                  key={`c-${b.i}`}
                  cx={cx}
                  cy={cy}
                  r={hover === b.i ? 4 : 2.5}
                  fill="var(--color-amber)"
                  stroke="var(--color-paper)"
                  strokeWidth="1"
                  pointerEvents="none"
                />
              );
            })
          : null}
        {bars.map((b) =>
          b.i % labelStep === 0 || b.i === n - 1 ? (
            <text
              key={`l-${b.i}`}
              x={b.x + barW / 2}
              y={height - 10}
              textAnchor="middle"
              fill="var(--color-faint)"
              fontSize="9"
            >
              {b.label}
            </text>
          ) : null,
        )}
      </svg>
      {tip ? (
        <div className="pointer-events-none absolute top-8 right-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11px] shadow-sm">
          <p className="font-medium text-ink">{tip.label}</p>
          <p className="tabular-nums text-muted">
            {valueLabel} : {tip.value.toLocaleString("fr-FR")}
          </p>
          {(tip.costEur ?? 0) > 0 ? (
            <p className="font-medium tabular-nums text-amber">
              {formatEur(tip.costEur ?? 0)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Colonnes pour catégories (routes, kinds) — hauteur = coût € si dispo. */
export function CategoryChart({
  points,
  mode = "cost",
  height = 200,
}: {
  points: ChartPoint[];
  /** Affiche € en hauteur principale, tokens en tooltip. */
  mode?: "cost" | "value";
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = useMemo(
    () =>
      [...points].sort((a, b) => {
        const av = mode === "cost" ? (a.costEur ?? 0) : a.value;
        const bv = mode === "cost" ? (b.costEur ?? 0) : b.value;
        return bv - av;
      }),
    [points, mode],
  );
  const w = 640;
  const pad = { t: 28, r: 12, b: 48, l: 12 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = Math.max(sorted.length, 1);
  const gap = 10;
  const barW = Math.max(18, (innerW - gap * (n - 1)) / n);
  const max =
    mode === "cost"
      ? niceMax(Math.max(...sorted.map((p) => p.costEur ?? 0), 0.01))
      : niceMax(Math.max(...sorted.map((p) => p.value), 1));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="h-auto w-full"
        role="img"
      >
        {sorted.map((p, i) => {
          const raw = mode === "cost" ? (p.costEur ?? 0) : p.value;
          const h = Math.max(2, (raw / max) * innerH);
          const x = pad.l + i * (barW + gap);
          const y = pad.t + innerH - h;
          const active = hover == null || hover === i;
          return (
            <g
              key={p.label}
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={4}
                fill={mode === "cost" ? "var(--color-amber)" : "var(--color-teal)"}
                opacity={active ? 0.95 : 0.35}
              />
              <text
                x={x + barW / 2}
                y={height - 28}
                textAnchor="middle"
                fill="var(--color-ink)"
                fontSize="10"
                fontWeight="500"
              >
                {p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label}
              </text>
              <text
                x={x + barW / 2}
                y={height - 12}
                textAnchor="middle"
                fill="var(--color-faint)"
                fontSize="9"
              >
                {mode === "cost"
                  ? `${shortNum(p.value)} tok`
                  : shortNum(p.value)}
              </text>
              {mode === "cost" && raw > 0 ? (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="var(--color-amber)"
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatEur(raw)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover != null && sorted[hover] ? (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11px] shadow-sm">
          <p className="font-medium text-ink">{sorted[hover].label}</p>
          <p className="tabular-nums text-muted">
            {sorted[hover].value.toLocaleString("fr-FR")} tokens
          </p>
          {(sorted[hover].costEur ?? 0) > 0 ? (
            <p className="font-medium tabular-nums text-amber">
              {formatEur(sorted[hover].costEur ?? 0)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Conservé pour compat — délègue au TimeSeriesChart. */
export function BarChart({
  rows,
  valueKey,
  labelKey,
  costEurKey,
  maxBars = 24,
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  suffix?: string;
  costEurKey?: string;
  maxBars?: number;
}) {
  const points: ChartPoint[] = rows.map((r) => ({
    label: String(r[labelKey]),
    value: Number(r[valueKey]) || 0,
    costEur: costEurKey != null ? Number(r[costEurKey]) || 0 : undefined,
  }));
  return (
    <TimeSeriesChart
      points={points}
      valueLabel={valueKey}
      maxPoints={maxBars}
    />
  );
}

export function HourHeatmap({
  rows,
}: {
  rows: { hour: number; count: number }[];
}) {
  const points: ChartPoint[] = rows.map((r) => ({
    label: `${r.hour}h`,
    value: r.count,
  }));
  return (
    <TimeSeriesChart points={points} valueLabel="Séances" height={160} maxPoints={24} />
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
