"use client";

import { useEffect, useState } from "react";
import type { AnthropicFailKind } from "@/lib/anthropic";
import { probeAiRecovery } from "@/lib/ai-recovery-client";
import { aiUserFailCopy, BYOK_HINT } from "@/lib/ai-user-messages";
import {
  dismissAiDegraded,
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
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    setStored(readAiDegraded());
    function sync() {
      setStored(readAiDegraded());
    }
    window.addEventListener("elan:ai-degraded", sync);
    window.addEventListener("elan:ai-recovered", sync);
    return () => {
      window.removeEventListener("elan:ai-degraded", sync);
      window.removeEventListener("elan:ai-recovered", sync);
    };
  }, []);

  const kind: AiDegradedKind | null =
    liveKind === "credits" || liveKind === "quota" || liveKind === "no_key"
      ? liveKind
      : stored;

  useEffect(() => {
    if (!kind) return;
    void probeAiRecovery();
    function onVisible() {
      if (document.visibilityState === "visible") void probeAiRecovery();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [kind]);

  if (!kind) return null;

  const copy = aiUserFailCopy(kind);

  async function retry() {
    setProbing(true);
    try {
      await probeAiRecovery({ force: true });
    } finally {
      setProbing(false);
    }
  }

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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void retry()}
            disabled={probing}
            className="rounded-lg px-2 py-1 text-[12px] font-medium text-teal transition hover:underline disabled:opacity-50"
          >
            {probing ? "Vérification…" : "Réessayer"}
          </button>
          <button
            type="button"
            onClick={() => dismissAiDegraded()}
            aria-label="Masquer"
            className="rounded-lg px-2 py-1 text-lg text-faint transition hover:text-ink"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
