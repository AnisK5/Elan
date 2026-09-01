"use client";

import { useState } from "react";
import {
  ACQUISITION_CHANNELS,
  type AcquisitionInfo,
} from "@/lib/acquisition";

export { needsAcquisitionPrompt, isAcquisitionResolved } from "@/lib/acquisition";

export default function AcquisitionPrompt({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (channel: string, detail?: string) => void;
  onDismiss: () => void;
}) {
  const [channel, setChannel] = useState("");
  const [detail, setDetail] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="acquisition-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h2
          id="acquisition-title"
          className="font-display text-xl font-semibold text-ink"
        >
          Comment tu as trouvé Élan ?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Une question rapide — ça m&apos;aide à comprendre d&apos;où viennent
          les gens (30 sec).
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {ACQUISITION_CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannel(c.id)}
              className={`rounded-xl border px-4 py-3 text-left text-[14px] transition ${
                channel === c.id
                  ? "border-teal bg-teal-soft/50 text-teal-ink"
                  : "border-line bg-paper text-ink hover:border-teal/30"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {channel === "other" ? (
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Précise si tu veux…"
            className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-faint"
          />
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl px-4 py-2.5 text-[14px] text-muted transition hover:text-ink"
          >
            Plus tard
          </button>
          <button
            type="button"
            disabled={!channel}
            onClick={() =>
              onSubmit(channel, detail.trim() || undefined)
            }
            className="rounded-xl bg-teal px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-teal-ink disabled:opacity-40"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
