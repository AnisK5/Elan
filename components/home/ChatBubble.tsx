"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChatMessage, Thread } from "@/lib/types";
import AiRetryBanner from "@/components/AiRetryBanner";
import { AssistantSpeech } from "@/components/HighlightEncart";
import { Dot } from "@/components/home/Branding";

/** Passe-plat hors séance : composeur en bas, carte légère au-dessus de l'accueil. */

function ClerkNote({
  note,
  undo,
  onUndo,
}: {
  note: string;
  undo: Thread[] | null;
  onUndo: () => void;
}) {
  if (!note) return null;
  return (
    <div className="animate-rise flex items-center gap-2 rounded-2xl border border-teal-soft bg-teal-soft/80 px-3.5 py-2 text-[13px] leading-snug text-teal-ink">
      <span aria-hidden>✏️</span>
      <span className="flex-1">{note}</span>
      {undo && (
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-md px-2 py-0.5 font-medium text-teal underline-offset-2 hover:underline"
        >
          annuler
        </button>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0 text-teal"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 18.5 4 21l3.2-1.2A8.5 8.5 0 1 0 5.5 18.5Z" />
    </svg>
  );
}

function Composer({
  pointRef,
  pointText,
  onPointText,
  onSend,
  busy,
}: {
  pointRef: RefObject<HTMLTextAreaElement | null>;
  pointText: string;
  onPointText: (v: string) => void;
  onSend: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={pointRef}
        value={pointText}
        onChange={(e) => onPointText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder="ex. j'ai appelé le dentiste"
        className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!pointText.trim() || busy}
        className="mb-1.5 shrink-0 px-2 py-1 text-sm font-medium text-teal transition hover:text-teal-ink disabled:opacity-40"
      >
        {busy ? "…" : "Envoyer →"}
      </button>
    </div>
  );
}

export default function ChatBubble({
  chat,
  pointText,
  onPointText,
  onSend,
  busy,
  error,
  onRetry,
  note,
  undo,
  onUndo,
  onReset,
  trucs,
}: {
  chat: ChatMessage[];
  pointText: string;
  onPointText: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  error: string;
  onRetry: () => void;
  note: string;
  undo: Thread[] | null;
  onUndo: () => void;
  onReset: () => void;
  trucs?: string[];
}) {
  const [open, setOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat, open, busy]);

  useEffect(() => {
    if (open) pointRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto flex max-w-xl flex-col gap-2 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2">
        {!open && note ? (
          <div className="pointer-events-auto">
            <ClerkNote note={note} undo={undo} onUndo={onUndo} />
          </div>
        ) : null}
        {!open && error ? (
          <div className="pointer-events-auto">
            <AiRetryBanner message={error} busy={busy} onRetry={onRetry} />
          </div>
        ) : null}

        {open ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-label="Une info en passant"
            className="pointer-events-auto flex max-h-[min(42dvh,22rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-[0_-10px_40px_-18px_rgba(38,35,29,0.35)] backdrop-blur-[8px]"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Replier"
              className="flex flex-col items-center gap-1 pt-2 pb-1"
            >
              <span className="h-1 w-10 rounded-full bg-line" />
              <span className="text-[11px] font-medium tracking-wide text-faint">
                replier
              </span>
            </button>
            <div className="flex items-center justify-between gap-3 px-4 pb-1">
              <p className="text-xs font-medium text-faint">
                Une info en passant
              </p>
              {chat.length > 0 ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
                >
                  effacer
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-1">
              {chat.length === 0 && !busy ? (
                <p className="px-1 text-[14px] leading-relaxed text-faint">
                  Une nouvelle, une question — le travail, c&apos;est la séance.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {chat.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      {m.role === "user" ? (
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sink px-3.5 py-2 text-[15px] leading-relaxed text-ink">
                          {m.content}
                        </div>
                      ) : (
                        <div className="max-w-[92%] px-1 py-1">
                          {m.content ? (
                            <AssistantSpeech
                              content={m.content}
                              className="whitespace-pre-wrap text-[15px] leading-relaxed text-teal-ink"
                              trucs={trucs}
                            />
                          ) : busy ? (
                            <span className="inline-flex gap-1 py-1">
                              <Dot /> <Dot /> <Dot />
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-line px-2 pt-2 pb-2">
              <Composer
                pointRef={pointRef}
                pointText={pointText}
                onPointText={onPointText}
                onSend={onSend}
                busy={busy}
              />
              {error ? (
                <div className="px-2 pb-1 pt-1">
                  <AiRetryBanner
                    message={error}
                    busy={busy}
                    onRetry={onRetry}
                  />
                </div>
              ) : null}
              {note ? (
                <div className="px-2 pb-1 pt-1">
                  <ClerkNote note={note} undo={undo} onUndo={onUndo} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-haspopup="dialog"
            aria-label="Donner une info en passant"
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-full border border-line bg-surface px-4 py-3 text-left shadow-[0_-6px_24px_-12px_rgba(38,35,29,0.35)] transition hover:border-teal/40"
          >
            <ChatIcon />
            <span className="min-w-0 flex-1 truncate text-[15px] text-faint">
              {busy
                ? "Élan range ça…"
                : chat.length > 0
                  ? "Continuer avec Élan"
                  : "Une info en passant…"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
