"use client";

import { useEffect, useState } from "react";
import { isAiEnabled, setAiEnabled } from "@/lib/ai-enabled";

function openSettings() {
  window.dispatchEvent(new CustomEvent("elan:open-settings"));
}

/** Bandeau permanent tant que l'IA est coupée — pour ne pas oublier. */
export default function AiPausedBanner() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    function sync() {
      setPaused(!isAiEnabled());
    }
    sync();
    window.addEventListener("elan:ai-enabled", sync);
    return () => window.removeEventListener("elan:ai-enabled", sync);
  }, []);

  if (!paused) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">IA en pause</p>
          <p className="mt-1 text-muted">
            Aucun appel Claude sur cet appareil — liste et créneaux OK. Pense à
            la réactiver quand tu as fini de tester.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setAiEnabled(true)}
            className="rounded-lg px-2 py-1 text-[12px] font-medium text-teal transition hover:underline"
          >
            Réactiver
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="rounded-lg px-2 py-1 text-[12px] text-faint transition hover:text-ink"
          >
            Réglages
          </button>
        </div>
      </div>
    </div>
  );
}
