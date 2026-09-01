"use client";

import { useEffect, useState } from "react";
import {
  dismissByokFallbackNotice,
  readByokFallbackNotice,
} from "@/lib/anthropic-key-client";

function openSettings() {
  window.dispatchEvent(new CustomEvent("elan:open-settings"));
}

/** Info discrète : on a basculé sur la clé de l'app. */
export default function ByokFallbackNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function sync() {
      setVisible(readByokFallbackNotice());
    }
    sync();
    window.addEventListener("elan:byok-fallback", sync);
    window.addEventListener("elan:ai-recovered", sync);
    return () => {
      window.removeEventListener("elan:byok-fallback", sync);
      window.removeEventListener("elan:ai-recovered", sync);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <p>
          Ta clé Claude perso ne répondait plus — on utilise celle de
          l&apos;app.{" "}
          <button
            type="button"
            onClick={openSettings}
            className="font-medium text-teal transition hover:underline"
          >
            Réglages
          </button>
        </p>
        <button
          type="button"
          onClick={() => dismissByokFallbackNotice()}
          aria-label="Masquer"
          className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-lg text-faint transition hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
