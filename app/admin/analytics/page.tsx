"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/home/Branding";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import type { AdminAnalyticsSnapshot } from "@/lib/admin-analytics";
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

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/analytics")
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
        setData((await res.json()) as AdminAnalyticsSnapshot);
      })
      .catch(() => {
        if (!cancelled) setError("fail");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </Link>
        <Link href="/admin" className="text-sm text-muted transition hover:text-ink">
          Usage
        </Link>
      </header>

      <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
        Analytics
      </h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        Tokens, séances, heures, abandon — pour comprendre comment les gens
        vivent Élan.
      </p>

      {error === "auth" && (
        <p className="mt-8 text-[15px] text-muted">Connecte-toi pour voir ces stats.</p>
      )}
      {error === "forbidden" && (
        <p className="mt-8 text-[15px] text-muted">Accès refusé.</p>
      )}
      {error === "setup" && (
        <p className="mt-8 text-[15px] text-muted">Configuration serveur incomplète.</p>
      )}
      {error === "fail" && (
        <p className="mt-8 text-[15px] text-amber">Impossible de charger les analytics.</p>
      )}

      {!error && !data && (
        <p className="mt-8 text-sm text-faint">Chargement…</p>
      )}

      {data ? (
        <div className="mt-8">
          <AnalyticsDashboard data={data} />
        </div>
      ) : null}
    </main>
  );
}
