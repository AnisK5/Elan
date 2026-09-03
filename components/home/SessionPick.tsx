import type { SessionContext } from "@/lib/types";
import { DURATIONS } from "@/lib/constants";

/** Boutons durée (bureau) + contextes Déposer / Sortie / Courses / Régulier. */

const CONTEXTS = [
  { id: "deposer" as const, label: "Déposer" },
  { id: "sortie" as const, label: "Sortie" },
  { id: "courses" as const, label: "Courses" },
  { id: "regulier" as const, label: "Régulier" },
];

export default function SessionPick({
  duration,
  context,
  onPickDuration,
  onPickContext,
  durationHints,
  modeHints,
}: {
  duration: number;
  context: SessionContext;
  onPickDuration: (d: number) => void;
  onPickContext: (c: "sortie" | "courses" | "regulier" | "deposer") => void;
  /** Pastilles recommandées par durée (moments encore ouverts). */
  durationHints?: Partial<Record<5 | 15 | 30 | 50, number>>;
  /** Modes hors bureau encore recommandés. */
  modeHints?: ReadonlySet<SessionContext>;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5">
      <p className="text-[11px] text-faint">Lancer une séance</p>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {DURATIONS.map((d) => {
          const hints = durationHints?.[d as 5 | 15 | 30 | 50] ?? 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDuration(d)}
              className={`relative min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[13px] font-medium tabular-nums transition sm:px-3 sm:text-sm ${
                context === "desk" && duration === d
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {d}&nbsp;min
              {hints > 0 ? (
                <span
                  className="pointer-events-none absolute top-1 right-1 flex gap-0.5"
                  aria-hidden
                >
                  {Array.from({ length: Math.min(hints, 2) }, (_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-teal"
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {CONTEXTS.map(({ id, label }) => {
          const hinted = modeHints?.has(id) ?? false;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPickContext(id)}
              className={`relative min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[13px] font-medium transition sm:px-2 sm:text-sm ${
                context === id
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
              {hinted && context !== id ? (
                <span
                  className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-teal"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
