"use client";

import SessionTranscript from "@/components/admin/SessionTranscript";
import type { ChatMessage } from "@/lib/types";

export default function HomeChatPanel({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-4 text-[13px] text-muted">
        Aucun message dans le chat accueil pour l&apos;instant.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <p className="mb-2 px-1 text-[12px] text-muted">
        {messages.length} message{messages.length > 1 ? "s" : ""} — chat « info
        en passant »
      </p>
      <SessionTranscript transcript={messages} maxHeight="360px" />
    </div>
  );
}
