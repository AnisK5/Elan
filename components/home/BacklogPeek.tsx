"use client";

import { useState } from "react";
import { findReguliersThread } from "@/lib/entretiens";
import { useThreads } from "@/lib/store";
import ThreadRow from "@/components/ThreadRow";

/** Aperçu optionnel du backlog — la personne n'a pas à le gérer seule. */

export default function BacklogPeek({
  open,
  actions,
  suivis,
  ready,
}: {
  open: number;
  actions: number;
  suivis: number;
  ready: boolean;
}) {
  const [show, setShow] = useState(false);
  const { threads, patch, remove } = useThreads();
  const openList = threads.filter((t) => t.status === "open");
  const reguliers = findReguliersThread(openList);

  if (!ready) return null;

  if (open === 0 && !reguliers) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
        Rien en attente. Tête légère — ou dépose ce qui traîne.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-sink/40 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink">
          {open > 0 ? (
            <>
              Je garde{" "}
              <b className="font-display text-lg">{actions}</b>{" "}
              {actions > 1 ? "trucs à faire" : "truc à faire"}
              {suivis > 0 && (
                <>
                  {" "}
                  · <b className="font-display text-lg">{suivis}</b> à suivre
                </>
              )}
              {reguliers ? " · plus tes réguliers." : "."}
            </>
          ) : (
            <>Je garde tes réguliers — rien d&apos;autre qui presse.</>
          )}
        </p>
        <button
          onClick={() => setShow((s) => !s)}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          {show ? "masquer" : "y jeter un œil"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Tu n&apos;as pas à les gérer, ni même à les regarder. Je m&apos;en occupe
        avec toi pendant la séance, un morceau à la fois.
      </p>

      {show && (
        <div className="mt-3 flex flex-col gap-0.5 border-t border-line pt-3">
          {threads
            .filter((t) => t.status === "open")
            .map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                patch={patch}
                remove={remove}
              />
            ))}
        </div>
      )}
    </div>
  );
}
