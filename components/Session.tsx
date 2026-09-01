"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, SessionContext, SessionLog, Thread } from "@/lib/types";
import { filterEffectiveOps, parseThreadOps } from "@/lib/ops";
import {
  apiFetch,
  anthropicFailMessage,
  parseStreamError,
} from "@/lib/anthropic";
import { aiRetryHint, reportAiRecovered } from "@/lib/ai-fail-client";
import { reportAiFailUnlessRecovered } from "@/lib/ai-recovery-client";
import AiRetryBanner from "@/components/AiRetryBanner";
import {
  applyThreadOps,
  clearActiveSession,
  newId,
  restoreThreads,
  snapshotThreads,
  useThreads,
  writeActiveSession,
  writeSituation,
  readSituation,
  type ActiveSession,
} from "@/lib/store";
import { extractSituationFromConvo, mergeSituation } from "@/lib/situation";
import { AssistantSpeech } from "@/components/HighlightEncart";
import { isUntimedSession } from "@/lib/session-mode";
import { trucLabels } from "@/lib/emphasize-truc";
import { sessionOpeningFromBrief } from "@/lib/session-opening";
import QuickCapture from "./QuickCapture";
import ThreadRow from "./ThreadRow";

export default function Session({
  durationMin,
  context = "desk",
  name,
  initial,
  priorSessionsToday = [],
  ritualBrief,
  situation,
  onEnd,
}: {
  durationMin: number;
  context?: SessionContext;
  name?: string;
  initial?: ActiveSession | null;
  priorSessionsToday?: SessionLog[];
  ritualBrief?: { message: string } | null;
  situation?: string;
  onEnd: (transcript: ChatMessage[], sessionId: string) => void;
}) {
  const { threads, add, patch, remove, ready } = useThreads();
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [errorHint, setErrorHint] = useState("");
  const [elapsed, setElapsed] = useState(initial?.elapsedSec ?? 0);
  const [running, setRunning] = useState(true);
  const [panel, setPanel] = useState<"none" | "capture" | "threads">("none");
  const [note, setNote] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<Thread[] | null>(null);

  const elapsedRef = useRef(initial?.elapsedSec ?? 0);
  const startedAtRef = useRef(initial?.startedAt ?? new Date().toISOString());
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const closed = useRef(false);
  const ritualBriefRef = useRef(ritualBrief);
  ritualBriefRef.current = ritualBrief;
  const retryRef = useRef<{
    convo: ChatMessage[];
    ending: boolean;
  } | null>(null);
  const sessionIdRef = useRef(initial?.sessionId ?? newId());
  const turnRef = useRef(0);

  const outdoor = isUntimedSession(context);
  const totalSec = durationMin * 60;
  const remaining = totalSec - elapsed;
  const overtime = !outdoor && remaining < 0;

  // Minuteur
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Ouverture — ou reprise d'une séance interrompue par un refresh.
  // On attend que les fils soient chargés (ready) : sinon le guide démarre
  // avec une liste vide et croit à tort qu'il n'y a rien à faire.
  useEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    const prior = (initial?.messages ?? []).filter((m) => m.content.trim());
    if (prior.length === 0) {
      const brief = ritualBriefRef.current?.message?.trim() ?? "";
      if (brief && context !== "deposer") {
        // Le créneau a déjà choisi : on n'envoie pas le modèle recomposer.
        setMessages([
          {
            role: "assistant",
            content: sessionOpeningFromBrief(brief),
            at: new Date().toISOString(),
          },
        ]);
      } else {
        void runTurn([]);
      }
    } else if (prior[prior.length - 1].role === "user") {
      void runTurn(prior); // le refresh a coupé la réponse du guide : on la relance
    }
    // sinon : on a déjà la dernière réponse du guide, on attend simplement l'utilisateur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Sauvegarde continue : une séance survit à un refresh / une fermeture d'onglet
  useEffect(() => {
    writeActiveSession({
      durationMin,
      context,
      elapsedSec: elapsedRef.current,
      messages,
      startedAt: startedAtRef.current,
      sessionId: sessionIdRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, elapsed, context]);

  // Auto-défilement
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  // Clôture automatique quand le temps est écoulé (séances bureau uniquement).
  useEffect(() => {
    if (outdoor || closed.current || streaming) return;
    if (remaining > 0) return;
    const convo = messages.filter((m) => m.content.trim().length > 0);
    if (convo.length === 0) return;
    closed.current = true;
    setRunning(false);
    void runTurn(convo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, streaming, messages]);

  async function runTurn(convo: ChatMessage[], ending = false) {
    setError("");
    setErrorHint("");
    retryRef.current = { convo, ending };
    setStreaming(true);
    const at = new Date().toISOString();
    setMessages([...convo, { role: "assistant", content: "", at }]);
    const exchangeIndex = convo.filter((m) => m.role === "user").length;

    try {
      const res = await apiFetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: convo,
          threads: threadsRef.current,
          meta: {
            durationMin,
            context,
            elapsedSec: elapsedRef.current,
            remainingSec: totalSec - elapsedRef.current,
            name,
            ending,
            situation,
            priorSessionsToday,
            ritualBrief: ritualBriefRef.current ?? undefined,
            sessionId: sessionIdRef.current,
            exchangeIndex,
          },
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || anthropicFailMessage("unknown"));
        setMessages(convo);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const { clean, kind } = parseStreamError(acc);
        if (kind) {
          const recovered = await reportAiFailUnlessRecovered(kind);
          if (!recovered) {
            setError(anthropicFailMessage(kind));
            setErrorHint(aiRetryHint(kind) ?? "");
          } else {
            setError("");
            setErrorHint("");
          }
          setMessages(convo);
          return;
        }
        if (acc.includes("⟦elan-error")) continue;
        setMessages([...convo, { role: "assistant", content: clean, at }]);
      }

      const { clean, kind } = parseStreamError(acc);
      if (kind) {
        const recovered = await reportAiFailUnlessRecovered(kind);
        if (!recovered) {
          setError(anthropicFailMessage(kind));
          setErrorHint(aiRetryHint(kind) ?? "");
        } else {
          setError("");
          setErrorHint("");
        }
        setMessages(convo);
        return;
      }

      const lastWasUser = convo[convo.length - 1]?.role === "user";
      if (!ending && lastWasUser && clean.trim()) {
        void reconcile([...convo, { role: "assistant", content: clean }]);
      }
      reportAiRecovered();
    } catch {
      setError("Connexion interrompue.");
      setMessages(convo);
    } finally {
      setStreaming(false);
    }
  }

  async function reconcile(msgs: ChatMessage[]) {
    try {
      const prevSit = readSituation();
      const res = await apiFetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threads: threadsRef.current,
          // Derniers tours : assez pour le contexte, pas tout le transcript.
          messages: msgs.slice(-10),
          situation: prevSit?.text ?? null,
        }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as {
        updates?: unknown;
        note?: string;
        situation?: string;
      };
      const extracted = extractSituationFromConvo(msgs.slice(-4));
      const fromApi = j.situation?.trim()
        ? { text: j.situation.trim() }
        : null;
      const sit = mergeSituation(extracted, fromApi);
      const sitChanged = Boolean(
        sit && sit.text.trim() !== (prevSit?.text ?? "").trim(),
      );
      if (sitChanged && sit) {
        writeSituation(mergeSituation(prevSit, sit));
      }
      const before = snapshotThreads();
      const ops = filterEffectiveOps(
        before,
        parseThreadOps(
          j.updates,
          new Set(before.map((t) => t.id)),
          before,
        ),
      );
      if (ops.length > 0) {
        applyThreadOps(ops);
        setUndoSnapshot(before);
        setNote(j.note || "trucs mis à jour");
        window.setTimeout(() => {
          setNote("");
          setUndoSnapshot(null);
        }, 10000);
      } else if (sitChanged) {
        setNote(j.note || "c'est noté");
        window.setTimeout(() => setNote(""), 10000);
      }
    } catch {
      // silencieux : la mise à jour des trucs ne doit jamais casser la séance
    }
  }

  function send() {
    const t = input.trim();
    if (!t || streaming) return;
    const convo: ChatMessage[] = [
      ...messages.filter((m) => m.content.trim().length > 0),
      { role: "user", content: t, at: new Date().toISOString() },
    ];
    setInput("");
    void runTurn(convo);
  }

  const openThreads = threads.filter((t) => t.status === "open");
  const trucs = trucLabels(threads);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      {/* Barre du haut : minuteur + contrôles */}
      <header className="border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-5 py-3">
          {outdoor ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold text-ink">
                  {context === "courses"
                    ? "Courses"
                    : context === "deposer"
                      ? "Déposer"
                      : "Sortie"}
                </span>
                <span className="text-xs text-muted">pas de chrono</span>
              </div>
              <div className="flex-1" />
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-display text-2xl font-semibold tabular-nums ${
                    overtime ? "text-amber" : "text-ink"
                  }`}
                >
                  {fmt(Math.abs(remaining))}
                </span>
                <span className="text-xs text-muted">
                  {context === "regulier" ? "régulier · " : ""}
                  {overtime ? "au-delà" : `sur ${durationMin} min`}
                </span>
              </div>
              <div className="flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-sink">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      overtime ? "bg-amber" : "bg-teal"
                    }`}
                    style={{
                      width: `${Math.min(100, (elapsed / totalSec) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <button
                onClick={() => setRunning((r) => !r)}
                className="rounded-lg px-2 py-1 text-sm text-muted transition hover:text-ink"
              >
                {running ? "Pause" : "Reprendre"}
              </button>
            </>
          )}
          <button
            onClick={() => {
              clearActiveSession();
              onEnd(
                messages.filter((m) => m.content.trim()),
                sessionIdRef.current,
              );
            }}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper transition hover:opacity-90"
          >
            Terminer
          </button>
        </div>
      </header>

      {/* Fil de discussion */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="animate-rise">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal" />
                  <span className="text-xs font-medium tracking-wide text-teal">
                    Élan
                  </span>
                  {m.at && (
                    <span className="text-xs tabular-nums text-faint">
                      {hhmm(m.at)}
                    </span>
                  )}
                </div>
                {m.content ? (
                  <AssistantSpeech content={m.content} trucs={trucs} />
                ) : (
                  streaming && <TypingDots />
                )}
              </div>
            ) : (
              <div key={i} className="flex items-end justify-end gap-2">
                {m.at && (
                  <span className="mb-1 shrink-0 text-xs tabular-nums text-faint">
                    {hhmm(m.at)}
                  </span>
                )}
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-teal-soft px-4 py-2.5 text-[15px] leading-relaxed text-teal-ink">
                  {m.content}
                </p>
              </div>
            ),
          )}

          {error && (
            <AiRetryBanner
              message={error}
              hint={errorHint}
              busy={streaming}
              onRetry={() => {
                const r = retryRef.current;
                if (!r || streaming) return;
                void runTurn(r.convo, r.ending);
              }}
            />
          )}
        </div>
      </div>

      {/* Panneaux repliables */}
      {panel === "threads" && (
        <ThreadDrawer threads={openThreads} patch={patch} remove={remove} />
      )}
      {panel === "capture" && (
        <div className="mx-auto w-full max-w-2xl px-5 pb-2">
          <QuickCapture onAdd={add} autoFocus />
        </div>
      )}

      {/* Composer */}
      <footer className="border-t border-line bg-paper">
        <div className="mx-auto w-full max-w-2xl px-5 py-3">
          {note && (
            <div className="animate-rise mb-2 flex items-center gap-2 rounded-lg bg-teal-soft px-3 py-1.5 text-xs text-teal-ink">
              <span>✏️</span>
              <span className="flex-1">Élan a mis à jour tes trucs — {note}</span>
              {undoSnapshot && (
                <button
                  onClick={() => {
                    restoreThreads(undoSnapshot);
                    setUndoSnapshot(null);
                    setNote("");
                  }}
                  className="shrink-0 rounded-md px-2 py-0.5 font-medium text-teal underline-offset-2 hover:underline"
                >
                  annuler
                </button>
              )}
            </div>
          )}
          {context !== "deposer" && (
            <div className="mb-2 flex items-center gap-2">
              <Toggle
                active={panel === "capture"}
                onClick={() =>
                  setPanel((p) => (p === "capture" ? "none" : "capture"))
                }
              >
                + un truc
              </Toggle>
              <Toggle
                active={panel === "threads"}
                onClick={() =>
                  setPanel((p) => (p === "threads" ? "none" : "threads"))
                }
              >
                Mes trucs ({openThreads.length})
              </Toggle>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_2px_20px_-12px_rgba(38,35,29,0.25)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={
                context === "deposer"
                  ? "Tout ce qui te trotte…"
                  : "Réponds au guide…"
              }
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="mb-0.5 shrink-0 rounded-xl bg-teal px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
            >
              Envoyer
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThreadDrawer({
  threads,
  patch,
  remove,
}: {
  threads: Thread[];
  patch: (id: string, changes: Partial<Thread>) => void;
  remove: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-h-64 w-full max-w-2xl overflow-y-auto px-5 pb-2">
      <div className="rounded-2xl border border-line bg-surface p-2">
        {threads.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted">
            Rien d&apos;ouvert. Tête légère.
          </p>
        ) : (
          threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              patch={patch}
              remove={remove}
              showSnooze
            />
          ))
        )}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "border-teal bg-teal-soft text-teal-ink"
          : "border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-breathe rounded-full bg-teal/50"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
