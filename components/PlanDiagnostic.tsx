"use client";

import { useState } from "react";
import type { PlanViewSnapshot } from "@/lib/plan-candidates";

export interface PlanDiagnosticData {
  view: PlanViewSnapshot;
  why?: string;
  /** Prompt system exact envoyé au modèle (diagnostic only). */
  system?: string;
  /** Message user / cue envoyé avec le system. */
  user?: string;
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
      "CANDIDATS BUREAU:",
      ...(data.view.candidates.length
        ? data.view.candidates
        : ["(aucun)"]),
      "",
      "CANDIDATS SORTIE:",
      ...(data.view.outdoor.length ? data.view.outdoor : ["(aucun)"]),
      "",
      "CONDITIONS JAMAIS POSÉES:",
      ...(data.view.conditions.length
        ? data.view.conditions
        : ["(aucun)"]),
      "",
      "EN ATTENTE:",
      ...(data.view.waiting.length ? data.view.waiting : ["(aucun)"]),
      "",
      "--- USER ---",
      data.user ?? "(pas de cue)",
      "",
      "--- SYSTEM ---",
      data.system ?? "(pas de prompt — offline ou cache)",
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
          <div>
            <p className="text-faint">Pourquoi (avant le conseil)</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink/85">
              {data.why}
            </p>
          </div>
        ) : (
          <p className="text-faint">
            Pourquoi · non demandé au modèle (ça allongeait et cassait le conseil)
          </p>
        )}
        <div>
          <p className="text-faint">Candidats bureau</p>
          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
            {data.view.candidates.length
              ? data.view.candidates.join("\n")
              : "(aucun)"}
          </pre>
        </div>
        {data.view.outdoor.length > 0 ? (
          <div>
            <p className="text-faint">Candidats sortie</p>
            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
              {data.view.outdoor.join("\n")}
            </pre>
          </div>
        ) : null}
        {data.view.conditions.length > 0 ? (
          <div>
            <p className="text-faint">Conditions jamais posées</p>
            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
              {data.view.conditions.join("\n")}
            </pre>
          </div>
        ) : null}
        <div>
          <p className="text-faint">En attente</p>
          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
            {data.view.waiting.length
              ? data.view.waiting.join("\n")
              : "(aucun)"}
          </pre>
        </div>
        <details className="rounded-md border border-line/50 bg-sink/40 px-2 py-1.5">
          <summary className="cursor-pointer select-none text-faint hover:text-ink">
            Instructions envoyées à l&apos;IA
            {data.system ? ` · ${data.system.length} car.` : ""}
          </summary>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {data.user ? (
              <div>
                <p className="text-faint">User</p>
                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
                  {data.user}
                </pre>
              </div>
            ) : null}
            {data.system ? (
              <div>
                <p className="text-faint">System</p>
                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-ink/80">
                  {data.system}
                </pre>
              </div>
            ) : (
              <p className="text-faint">
                Pas de prompt (réponse offline / sans appel API).
              </p>
            )}
          </div>
        </details>
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
