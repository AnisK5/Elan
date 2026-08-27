"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Thread } from "@/lib/types";
import type { PlanStatsForNotify } from "@/lib/notifications";
import RitualNotify from "@/components/RitualNotify";
import RitualNotifySettings from "@/components/RitualNotifySettings";
import AnthropicKeySettings from "@/components/AnthropicKeySettings";
import ModelSettings from "@/components/ModelSettings";
import DiagnosticSettings from "@/components/DiagnosticSettings";
import ImportData from "@/components/home/ImportData";
import FeedbackForm from "@/components/FeedbackForm";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { useSettings } from "@/lib/store";

/** Tiroir des réglages — hors du flux séance. */
export default function SettingsSheet({
  threads,
  planStats,
  onSignOut,
}: {
  threads: Thread[];
  planStats: PlanStatsForNotify;
  onSignOut: () => void;
}) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      const token = sb
        ? (await sb.auth.getSession()).data.session?.access_token
        : null;
      if (!token) return;
      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled || !res.ok) return;
      const j = (await res.json()) as { admin?: boolean };
      if (j.admin) setIsAdmin(true);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Réglages"
        title="Réglages"
        className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-sink hover:text-ink"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1 1.5H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 px-4 py-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Réglages"
            onClick={(e) => e.stopPropagation()}
            className="animate-rise max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-5 shadow-[0_20px_60px_-20px_rgba(38,35,29,0.45)]"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-display text-xl font-semibold leading-tight text-ink">
                Réglages
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-lg text-faint transition hover:text-ink"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {settings.notifyEnabled ? (
                <RitualNotifySettings
                  threads={threads}
                  planStats={planStats}
                />
              ) : (
                <RitualNotify
                  visible
                  embedded
                  threads={threads}
                  planStats={planStats}
                />
              )}
              <AnthropicKeySettings />
              <ModelSettings />
              <DiagnosticSettings />
              <FeedbackForm source="settings" />
              <ImportData />
              {isAdmin ? (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-line px-4 py-3 text-[15px] text-muted transition hover:text-ink"
                >
                  Stats d&apos;usage
                </Link>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="mt-6 w-full rounded-xl border border-line py-3 text-center text-[15px] text-muted transition hover:text-ink"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </>
  );
}
