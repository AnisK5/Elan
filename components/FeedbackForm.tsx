"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { logUsage } from "@/lib/usage-log";

export type FeedbackMood = "bien" | "bof" | "bloque";
export type FeedbackSource = "settings" | "wrap_up" | "home";

const MOODS: { value: FeedbackMood; label: string }[] = [
  { value: "bien", label: "Ça va" },
  { value: "bof", label: "Bof" },
  { value: "bloque", label: "Bloqué" },
];

async function postFeedback(
  message: string,
  mood: FeedbackMood | null,
  source: FeedbackSource,
): Promise<boolean> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  if (!token) return false;
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers,
    body: JSON.stringify({ message, mood, source }),
  });
  return res.ok;
}

export default function FeedbackForm({
  source = "settings",
  compact = false,
  onSent,
}: {
  source?: FeedbackSource;
  compact?: boolean;
  onSent?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [mood, setMood] = useState<FeedbackMood | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    const ok = await postFeedback(text, mood, source).catch(() => false);
    setBusy(false);
    if (!ok) {
      setError("Impossible d'envoyer — réessaie.");
      return;
    }
    logUsage("feedback", { meta: { mood: mood ?? undefined } });
    setMessage("");
    setMood(null);
    setSent(true);
    onSent?.();
    window.setTimeout(() => setSent(false), 3000);
  }

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-line bg-surface px-3 py-3"
          : "rounded-xl border border-line bg-surface px-4 py-4"
      }
    >
      <p className="text-[13px] font-medium text-ink">Un retour ?</p>
      <p className="mt-0.5 text-[12px] text-muted">
        Bug, idée, friction — ce que tu veux.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMood(mood === m.value ? null : m.value)}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
              mood === m.value
                ? "bg-teal text-white"
                : "bg-sink text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder="Dis-moi ce qui coince ou ce qui manque…"
        className="mt-3 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-teal"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!message.trim() || busy}
          className="rounded-lg bg-teal px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          {busy ? "…" : "Envoyer"}
        </button>
        {sent ? (
          <span className="text-[12px] text-teal">Merci — c&apos;est noté.</span>
        ) : null}
        {error ? (
          <span className="text-[12px] text-amber">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
