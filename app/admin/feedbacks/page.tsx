"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminFeedbacksSnapshot } from "@/lib/admin-feedbacks";
import {
  formatFeedbackMood,
  formatFeedbackSource,
} from "@/lib/feedback-labels";
import { getSupabase } from "@/lib/supabase";

async function adminGet(path: string): Promise<Response> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { headers });
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFeedbacksPage() {
  const [snap, setSnap] = useState<AdminFeedbacksSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/feedbacks")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setError("auth");
          return;
        }
        if (res.status === 403) {
          setError("forbidden");
          return;
        }
        if (res.status === 503) {
          setError("setup");
          return;
        }
        if (!res.ok) {
          setError("fail");
          return;
        }
        setSnap((await res.json()) as AdminFeedbacksSnapshot);
      })
      .catch(() => {
        if (!cancelled) setError("fail");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h2 className="font-display text-lg font-semibold text-ink">Retours</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        Messages envoyés via le formulaire — Réglages, aide, fin de séance.
      </p>

      {error === "auth" && (
        <p className="mt-8 text-[15px] text-muted">
          Connecte-toi depuis l&apos;accueil pour voir ces retours.
        </p>
      )}
      {error === "forbidden" && (
        <p className="mt-8 text-[15px] text-muted">
          Cette page n&apos;est pas ouverte pour ce compte.
        </p>
      )}
      {error === "setup" && (
        <p className="mt-8 text-[15px] text-muted">
          Il manque encore la clé serveur Supabase en local.
        </p>
      )}
      {error === "fail" && (
        <p className="mt-8 text-[15px] text-amber">
          Impossible de charger les retours pour le moment.
        </p>
      )}

      {!error && !snap && (
        <p className="mt-8 text-sm text-faint">Chargement…</p>
      )}

      {snap && (
        <section className="mt-8">
          <p className="text-[13px] text-muted">
            {snap.total === 0
              ? "Aucun retour pour l'instant."
              : `${snap.total} retour${snap.total > 1 ? "s" : ""}`}
          </p>

          {snap.feedbacks.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {snap.feedbacks.map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-line bg-surface px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
                    <Link
                      href={`/admin/users/${f.userId}`}
                      className="font-medium text-muted transition hover:text-teal"
                    >
                      {f.name || f.email || "—"}
                    </Link>
                    {f.name && f.email ? (
                      <span className="text-faint">{f.email}</span>
                    ) : null}
                    <span>· {fmtWhen(f.createdAt)}</span>
                    {f.mood ? (
                      <span>· {formatFeedbackMood(f.mood)}</span>
                    ) : null}
                    <span>· {formatFeedbackSource(f.source)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                    {f.message}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
