"use client";

import { useEffect, useState } from "react";
import {
  isDiagnosticEnabled,
  setDiagnosticEnabled,
} from "@/lib/diagnostic";

/** Toggle local — n'affecte que cet appareil. */
export default function DiagnosticSettings() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isDiagnosticEnabled());
  }, []);

  function toggle() {
    const next = !on;
    setDiagnosticEnabled(next);
    setOn(next);
    window.dispatchEvent(
      new CustomEvent("elan-diagnostic", { detail: { on: next } }),
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Diagnostic</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Sur cet appareil seulement. Affiche sous le conseil ce qu&apos;Élan
            a vu, et pourquoi il a choisi ça — rien n&apos;est envoyé ailleurs.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
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
    </div>
  );
}
