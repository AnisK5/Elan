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
  title = "Un retour ?",
  subtitle = "Ça va ou ça coince ? Dis-moi pourquoi si tu veux.",
}: {
  source?: FeedbackSource;
  compact?: boolean;
  onSent?: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy || !rating) return;
    const text = message.trim();
    setBusy(true);
    setError("");
    const ok = await postFeedback({
      message: text || (rating === "up" ? "👍" : "👎"),
      rating,
      source,
    }).catch(() => false);
    setBusy(false);
    if (!ok) {
      setError("Impossible d'envoyer — réessaie.");
      return;
    }
    logUsage("feedback", { meta: { mood: rating } });
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

      {rating ? (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={compact ? 2 : 3}
          placeholder="Pourquoi ? (optionnel)"
          className="mt-3 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-teal"
        />
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!rating || busy}
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
