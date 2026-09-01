"use client";

import { useEffect, useState } from "react";
import type { AnthropicFailKind } from "@/lib/anthropic";
import { aiUserFailCopy, BYOK_HINT } from "@/lib/ai-user-messages";
import {
  clearAiDegraded,
  readAiDegraded,
  type AiDegradedKind,
} from "@/lib/ai-degraded-client";

function openSettings() {
  window.dispatchEvent(new CustomEvent("elan:open-settings"));
}

export default function AiDegradedBanner({
  liveKind,
}: {
  /** Erreur IA fraîche (plan, chat…) — prioritaire sur sessionStorage. */
  liveKind?: AnthropicFailKind | null;
}) {
  const [stored, setStored] = useState<AiDegradedKind | null>(null);

  useEffect(() => {
    setStored(readAiDegraded());
    function sync() {
      setStored(readAiDegraded());
    }
    window.addEventListener("elan:ai-degraded", sync);
    return () => window.removeEventListener("elan:ai-degraded", sync);
  }, []);

  const kind: AiDegradedKind | null =
    liveKind === "credits" || liveKind === "quota"
      ? liveKind
      : stored;

  if (!kind) return null;

  const copy = aiUserFailCopy(kind);

  return (
    <div
      role="status"
      className="mb-4 rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">IA en pause — le reste marche</p>
          <p className="mt-1 text-muted">{copy.message}</p>
          {copy.showListHint ? (
            <p className="mt-1.5 text-muted">
              Liste, déposer, marquer réglé : toujours dispo.
            </p>
          ) : null}
          {copy.showByokHint ? (
            <p className="mt-1.5">
              <button
                type="button"
                onClick={openSettings}
                className="text-left font-medium text-teal transition hover:underline"
              >
                {BYOK_HINT}
              </button>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => clearAiDegraded()}
          aria-label="Masquer"
          className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-lg text-faint transition hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
