"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  dismissWtpPrompt,
  formatWtpFeedback,
  markWtpAnswered,
  type WtpAnswer,
} from "@/lib/product-surveys";
import { markModalShownThisVisit } from "@/lib/engagement-prompts";

async function postSurveyFeedback(message: string): Promise<boolean> {
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
      message,
      source: "survey_wtp",
    }),
  });
  return res.ok;
}

export default function ProductSurveyPrompt({ onClose }: { onClose: () => void }) {
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(answer: WtpAnswer) {
    if (busy) return;
    setBusy(true);
    const msg = formatWtpFeedback(answer, detail);
    await postSurveyFeedback(msg).catch(() => false);
    markWtpAnswered();
    markModalShownThisVisit();
    setBusy(false);
    onClose();
  }

  function dismiss() {
    dismissWtpPrompt(30);
    markModalShownThisVisit();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="wtp-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h2
          id="wtp-title"
          className="font-display text-xl font-semibold text-ink"
        >
          Une question rapide
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Élan est encore en beta gratuite. Si l&apos;app t&apos;aidait vraiment
          au quotidien, paierais-tu{" "}
          <b className="font-medium text-ink">5&nbsp;€/mois</b> ?
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {(
            [
              ["yes", "Oui"],
              ["maybe", "Peut-être"],
              ["no", "Non"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => void submit(id)}
              className="rounded-xl border border-line bg-paper px-4 py-3 text-left text-[14px] transition hover:border-teal/30 disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Pourquoi ? (optionnel)"
          className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-faint"
        />

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-xl px-4 py-2.5 text-[14px] text-muted transition hover:text-ink"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
