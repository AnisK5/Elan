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
  regulierDue = false,
}: {
  duration: number;
  context: SessionContext;
  onPickDuration: (d: number) => void;
  onPickContext: (c: "sortie" | "courses" | "regulier" | "deposer") => void;
  /** Pastille si un régulier mûr attend. */
  regulierDue?: boolean;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5">
      <p className="text-[11px] text-faint">Lancer une séance</p>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPickDuration(d)}
            className={`min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[13px] font-medium tabular-nums transition sm:px-3 sm:text-sm ${
              context === "desk" && duration === d
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {d}&nbsp;min
          </button>
        ))}
      </div>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {CONTEXTS.map(({ id, label }) => (
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
            {id === "regulier" && regulierDue && context !== "regulier" ? (
              <span
                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber"
                aria-hidden
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
