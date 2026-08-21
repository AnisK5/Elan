"use client";

import { useState } from "react";
import type { PlanViewSnapshot } from "@/lib/plan-candidates";

export interface PlanDiagnosticData {
  view: PlanViewSnapshot;
  why?: string;
  source: "api" | "cache" | "offline";
  message: string;
  pick: string;
}

/** Panneau discret sous le conseil — visible seulement si Diagnostic est ON. */
export default function PlanDiagnostic({ data }: { data: PlanDiagnosticData }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = [
      `source: ${data.source}`,
      `pick: ${data.pick}`,
      `message: ${data.message}`,
      data.why ? `why: ${data.why}` : "why: (pas encore)",
      "",
      "CANDIDATS:",
      ...(data.view.candidates.length
        ? data.view.candidates
        : ["(aucun)"]),
      "",
      "EN ATTENTE:",
      ...(data.view.waiting.length ? data.view.waiting : ["(aucun)"]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <details className="mt-2 rounded-lg border border-line/80 bg-paper/80 px-3 py-2 text-[12px] text-muted">
      <summary className="cursor-pointer select-none font-medium text-faint hover:text-ink">
        Diagnostic — ce qu&apos;Élan a vu
      </summary>
      <div className="mt-2 space-y-2 border-t border-line/60 pt-2">
        <p>
          <span className="text-faint">Source</span> · {data.source} · pick{" "}
          {data.pick}
        </p>
        {data.why ? (
          <p>
            <span className="text-faint">Pourquoi</span> · {data.why}
          </p>
        ) : (
          <p className="text-faint">
            Pourquoi · pas encore (rafraîchis le conseil ou change un truc)
          </p>
        )}
        <div>
          <p className="text-faint">Candidats</p>
          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
            {data.view.candidates.length
              ? data.view.candidates.join("\n")
              : "(aucun)"}
          </pre>
        </div>
        <div>
          <p className="text-faint">En attente</p>
          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
            {data.view.waiting.length
              ? data.view.waiting.join("\n")
              : "(aucun)"}
          </pre>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-muted transition hover:text-ink"
        >
          {copied ? "Copié" : "Copier le rapport"}
        </button>
      </div>
    </details>
  );
}
