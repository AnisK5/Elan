"use client";

import { useEffect, useState } from "react";
import {
  readModelPreference,
  writeModelPreference,
  type ModelPreference,
} from "@/lib/models";

/** Opus en séance par défaut ; Sonnet si on veut alléger le coût. */
export default function ModelSettings() {
  const [pref, setPref] = useState<ModelPreference>("present");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPref(readModelPreference());
  }, []);

  function choose(next: ModelPreference) {
    setPref(next);
    writeModelPreference(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">Présence en séance</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Le chat hors séance reste léger. La séance peut rester plus présente, ou
        passer sur le modèle plus économique.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => choose("present")}
          className={
            pref === "present"
              ? "rounded-xl border border-teal bg-teal-soft/60 px-3 py-2.5 text-left"
              : "rounded-xl border border-line bg-paper px-3 py-2.5 text-left transition hover:border-teal/40"
          }
        >
          <span className="block text-sm font-medium text-ink">
            Plus présent
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted">
            Séance en Opus · chat en Sonnet
          </span>
        </button>
        <button
          type="button"
          onClick={() => choose("light")}
          className={
            pref === "light"
              ? "rounded-xl border border-teal bg-teal-soft/60 px-3 py-2.5 text-left"
              : "rounded-xl border border-line bg-paper px-3 py-2.5 text-left transition hover:border-teal/40"
          }
        >
          <span className="block text-sm font-medium text-ink">Plus léger</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted">
            Sonnet partout — moins cher, un peu moins de présence
          </span>
        </button>
      </div>
      {saved && (
        <p className="mt-2 text-xs text-teal">Préférence enregistrée ici.</p>
      )}
    </div>
  );
}
