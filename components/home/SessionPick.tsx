import type { SessionContext } from "@/lib/types";
import { DURATIONS } from "@/lib/constants";

/** Boutons durée (bureau) + contexte Sortie / Courses. */

export default function SessionPick({
  duration,
  context,
  onPickDuration,
  onPickContext,
}: {
  duration: number;
  context: SessionContext;
  onPickDuration: (d: number) => void;
  onPickContext: (c: "sortie" | "courses") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl bg-sink p-1">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => onPickDuration(d)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              context === "desk" && duration === d
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {d} min
          </button>
        ))}
      </div>
      <span className="text-xs text-faint">·</span>
      <div className="inline-flex rounded-xl bg-sink p-1">
        {(
          [
            { id: "sortie" as const, label: "Sortie" },
            { id: "courses" as const, label: "Courses" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPickContext(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              context === id
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
