"use client";

import { useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { logUsage } from "@/lib/usage-log";

export type FeedbackRating = "up" | "down";
export type FeedbackMood = FeedbackRating | "bien" | "bof" | "bloque";
export type FeedbackSource =
  | "settings"
  | "wrap_up"
  | "home"
  | "survey_wtp";

async function postFeedback(opts: {
  message?: string;
  rating?: FeedbackRating | null;
  mood?: FeedbackMood | null;
  source: FeedbackSource;
}): Promise<boolean> {
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
    body: JSON.stringify({
      message: opts.message ?? "",
      rating: opts.rating ?? undefined,
      mood: opts.mood ?? undefined,
      source: opts.source,
    }),
  });
  return res.ok;
}

function ThumbButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-xl border text-xl transition ${
        active
          ? "border-teal bg-teal-soft text-teal-ink"
          : "border-line bg-paper text-muted hover:border-teal/30 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function FeedbackForm({
  source = "settings",
  compact = false,
  onSent,
  title = "Contact",
  subtitle = "Bug, idée, question — un bouton pour nous écrire.",
  contactHint = false,
}: {
  source?: FeedbackSource;
  compact?: boolean;
  onSent?: () => void;
  title?: string;
  subtitle?: string;
  /** Petite ligne de réassurance sous le bouton Envoyer. */
  contactHint?: boolean;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const canSend = Boolean(rating || message.trim());

  async function submit() {
    const text = message.trim();
    if (busy || (!rating && !text)) return;
    setBusy(true);
    setError("");
    const ok = await postFeedback({
      message:
        text || (rating === "up" ? "👍" : rating === "down" ? "👎" : ""),
      rating,
      source,
    }).catch(() => false);
    setBusy(false);
    if (!ok) {
      setError("Impossible d'envoyer — réessaie.");
      return;
    }
    if (rating) logUsage("feedback", { meta: { mood: rating } });
    setMessage("");
    setRating(null);
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
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>

      <div className="mt-3 flex items-center gap-2">
        <ThumbButton
          label="Ça va"
          active={rating === "up"}
          onClick={() => setRating(rating === "up" ? null : "up")}
        >
          👍
        </ThumbButton>
        <ThumbButton
          label="Ça coince"
          active={rating === "down"}
          onClick={() => setRating(rating === "down" ? null : "down")}
        >
          👎
        </ThumbButton>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={compact ? 2 : 3}
        placeholder="Écris ce que tu veux…"
        className="mt-3 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-teal"
      />

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSend || busy}
        className={`mt-2 w-full rounded-xl bg-teal font-medium text-white transition hover:bg-teal-ink disabled:opacity-40 ${
          compact ? "py-2 text-[13px]" : "py-2.5 text-[14px]"
        }`}
      >
        {busy ? "…" : sent ? "Merci — c'est noté" : "Envoyer"}
      </button>

      {error ? (
        <p className="mt-2 text-center text-[12px] text-amber">{error}</p>
      ) : null}

      {contactHint ? (
        <p className="mt-2 text-center text-[11px] text-faint">
          Ça nous arrive directement.
        </p>
      ) : null}
    </div>
  );
}
