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
}: {
  duration: number;
  context: SessionContext;
  onPickDuration: (d: number) => void;
  onPickContext: (c: "sortie" | "courses" | "regulier" | "deposer") => void;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5">
      <p className="text-[11px] text-faint">Lancer une séance</p>
      <p className="text-[11px] leading-snug text-muted">
        Tu te présentes comme tu es — pas un oui au conseil du dessus.
      </p>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {DURATIONS.map((d) => {
          const selected = context === "desk" && duration === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDuration(d)}
              className={`min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[13px] font-medium tabular-nums transition sm:px-3 sm:text-sm ${
                selected
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {d}&nbsp;min
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 w-full rounded-xl bg-sink p-1">
        {CONTEXTS.map(({ id, label }) => {
          const selected = context === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPickContext(id)}
              className={`min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[13px] font-medium transition sm:px-2 sm:text-sm ${
                selected
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
