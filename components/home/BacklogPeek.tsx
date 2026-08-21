"use client";

import { useState } from "react";
import { findReguliersThread, isContainerThread } from "@/lib/entretiens";
import { useThreads } from "@/lib/store";
import type { Thread } from "@/lib/types";
import ThreadRow from "@/components/ThreadRow";

/** Aperçu optionnel du backlog — la personne n'a pas à le gérer seule. */

const DONE_WINDOW_MS = 60 * 86_400_000;
const DONE_MAX = 20;

function recentDone(threads: Thread[]): Thread[] {
  const since = Date.now() - DONE_WINDOW_MS;
  return threads
    .filter((t) => {
      if (t.status !== "done" || isContainerThread(t)) return false;
      const at = Date.parse(t.doneAt ?? t.touchedAt ?? "");
      return Number.isFinite(at) && at >= since;
    })
    .sort(
      (a, b) =>
        Date.parse(b.doneAt ?? b.touchedAt ?? "0") -
        Date.parse(a.doneAt ?? a.touchedAt ?? "0"),
    )
    .slice(0, DONE_MAX);
}

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
  const done = recentDone(threads);

  if (!ready) return null;

  if (open === 0 && !reguliers && done.length === 0) {
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
              {reguliers ? " · plus tes réguliers" : ""}
              {done.length > 0
                ? ` · ${done.length} réglé${done.length > 1 ? "s" : ""} récemment`
                : ""}
              .
            </>
          ) : reguliers ? (
            <>
              Je garde tes réguliers
              {done.length > 0
                ? ` — et ${done.length} réglé${done.length > 1 ? "s" : ""} récemment.`
                : " — rien d'autre qui presse."}
            </>
          ) : (
            <>
              {done.length} réglé{done.length > 1 ? "s" : ""} récemment — tu
              peux les rouvrir si besoin.
            </>
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
          {openList.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              patch={patch}
              remove={remove}
            />
          ))}
          {done.length > 0 ? (
            <div className="mt-2 border-t border-line pt-2">
              <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-faint">
                Réglés récemment
              </p>
              {done.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  patch={patch}
                  remove={remove}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
