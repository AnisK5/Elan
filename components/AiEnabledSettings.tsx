"use client";

import { useEffect, useState } from "react";
import { isAiEnabled, setAiEnabled } from "@/lib/ai-enabled";

/** Coupe Claude sur cet appareil — utile pour tester sans brûler de crédits. */
export default function AiEnabledSettings() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(isAiEnabled());
  }, []);

  function toggle() {
    const next = !on;
    setAiEnabled(next);
    setOn(next);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Intelligence artificielle</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Sur cet appareil. Coupée : plus d&apos;appels Claude (conseil,
            séance, chat, greffier) — la liste et les séances manuelles restent.
            Un bandeau te le rappellera.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Intelligence artificielle"
          onClick={toggle}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${
            on ? "bg-teal" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-paper shadow transition ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {!on ? (
        <p className="mt-3 rounded-xl border border-amber/40 bg-amber-soft px-3 py-2 text-[12px] leading-relaxed text-ink">
          IA en pause — aucun crédit Anthropic. Réactive ici quand tu as fini de
          tester.
        </p>
      ) : null}
    </div>
  );
}
