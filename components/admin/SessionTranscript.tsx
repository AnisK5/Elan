"use client";

import { AssistantSpeech } from "@/components/HighlightEncart";
import type { ChatMessage } from "@/lib/types";

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionTranscript({
  transcript,
  maxHeight = "520px",
}: {
  transcript: ChatMessage[];
  maxHeight?: string;
}) {
  if (transcript.length === 0) {
    return (
      <p className="px-2 py-4 text-[13px] text-muted">
        Transcript vide — séance ouverte sans échange enregistré.
      </p>
    );
  }

  let userTurn = 0;

  return (
    <div
      className="flex flex-col gap-3 overflow-y-auto px-1 py-1"
      style={{ maxHeight }}
    >
      {transcript.map((m, i) => {
        const isUser = m.role === "user";
        if (isUser && m.content.trim()) userTurn += 1;
        return (
          <div
            key={i}
            className={isUser ? "flex justify-end" : "flex justify-start"}
          >
            <div className="max-w-[92%]">
              <div
                className={`mb-1 flex items-center gap-2 text-[10px] text-faint ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                <span>{isUser ? "Personne" : "Élan"}</span>
                {isUser && m.content.trim() ? (
                  <span>· échange {userTurn}</span>
                ) : null}
                {m.at ? <span>· {fmtTime(m.at)}</span> : null}
              </div>
              {isUser ? (
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-sink px-3.5 py-2 text-[14px] leading-relaxed text-ink">
                  {m.content}
                </div>
              ) : (
                <div className="px-1 py-1">
                  <AssistantSpeech
                    content={m.content}
                    className="whitespace-pre-wrap text-[14px] leading-relaxed text-teal-ink"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
