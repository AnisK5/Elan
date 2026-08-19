"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Thread } from "@/lib/types";
import AiRetryBanner from "@/components/AiRetryBanner";
import { AssistantSpeech } from "@/components/HighlightEncart";
import { Dot } from "@/components/home/Branding";

/** Passe-plat hors séance : champ en bas (comme un composeur), calque au-dessus. */

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
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {!open && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <div className="mx-auto max-w-xl px-5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2">
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
                Une info en passant…
              </span>
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[45] flex items-end justify-center bg-ink/25 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Une info en passant"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[72dvh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface shadow-[0_-16px_50px_-18px_rgba(38,35,29,0.4)]"
          >
            <div className="flex justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pt-2">
              <p className="text-xs font-medium text-faint">
                Une info en passant
              </p>
              <div className="flex shrink-0 items-baseline gap-3">
                {chat.length > 0 && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
                  >
                    effacer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  replier
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-3">
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

            <div className="border-t border-line px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
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
                  className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
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
              {error && (
                <div className="px-2 pb-1 pt-1">
                  <AiRetryBanner
                    message={error}
                    busy={busy}
                    onRetry={onRetry}
                  />
                </div>
              )}
              {note && (
                <div className="animate-rise flex items-center gap-2 px-3 pb-1 pt-1 text-xs text-teal-ink">
                  <span>✏️</span>
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
