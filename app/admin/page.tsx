"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/home/Branding";
import type { AdminSnapshot } from "@/lib/admin-stats";
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

function pct(n: number | null): string {
  return n === null ? "—" : `${n} %`;
}

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminPage() {
  const [snap, setSnap] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/stats")
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
        setSnap((await res.json()) as AdminSnapshot);
      })
      .catch(() => {
        if (!cancelled) setError("fail");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const t = snap?.totals;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </Link>
        <Link href="/" className="text-sm text-muted transition hover:text-ink">
          Accueil
        </Link>
      </header>

      <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
        Usage
      </h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        Rétention, séances, temps passé — pour suivre le partage, pas pour
        noter les gens.
      </p>

      {error === "auth" && (
        <p className="mt-8 text-[15px] text-muted">
          Connecte-toi depuis l&apos;accueil pour voir ces chiffres.
        </p>
      )}
      {error === "forbidden" && (
        <p className="mt-8 text-[15px] text-muted">
          Cette page n&apos;est pas ouverte pour ce compte.
        </p>
      )}
      {error === "setup" && (
        <p className="mt-8 text-[15px] text-muted">
          Il manque encore la clé serveur Supabase en local. Je m&apos;en
          occupe — recharge cette page après relance du serveur.
        </p>
      )}
      {error === "fail" && (
        <p className="mt-8 text-[15px] text-amber">
          Impossible de charger les stats pour le moment.
        </p>
      )}

      {!error && !snap && (
        <p className="mt-8 text-sm text-faint">Chargement…</p>
      )}

      {t && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Inscrits" value={String(t.signups)} hint={`${t.signups7} sur 7 j`} />
            <Stat label="Actifs aujourd'hui" value={String(t.dau)} />
            <Stat label="Actifs 7 j" value={String(t.wau)} />
            <Stat label="Actifs 30 j" value={String(t.mau)} />
            <Stat label="Stickiness" value={pct(t.stickiness)} hint="DAU / MAU" />
            <Stat label="Activés" value={pct(t.activatedPct)} hint="≥ 1 séance" />
            <Stat label="Rétention J1" value={pct(t.d1)} />
            <Stat label="Rétention J7" value={pct(t.d7)} />
            <Stat label="Rétention J30" value={pct(t.d30)} />
            <Stat
              label="Séances / actif 7 j"
              value={String(t.sessionsPerActive7)}
            />
            <Stat label="Durée moy. séance" value={`${t.avgSessionMin} min`} />
            <Stat
              label="Temps dans l'app / actif 7 j"
              value={`${t.dwellPerActive7} min`}
            />
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">
              Chaque inscrit
            </h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Personne</th>
                    <th className="px-3 py-2 font-medium">Inscrit</th>
                    <th className="px-3 py-2 font-medium">Vu</th>
                    <th className="px-3 py-2 font-medium">Jours / 30</th>
                    <th className="px-3 py-2 font-medium">Séances</th>
                    <th className="px-3 py-2 font-medium">Min</th>
                    <th className="px-3 py-2 font-medium">Dwell</th>
                    <th className="px-3 py-2 font-medium">Suite</th>
                    <th className="px-3 py-2 font-medium">Réglés / 30</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.users.map((u) => (
                    <tr key={u.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">
                          {u.name || u.email || "—"}
                        </div>
                        {u.name ? (
                          <div className="text-[11px] text-faint">{u.email}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted">{fmtDay(u.signedUp)}</td>
                      <td className="px-3 py-2 text-muted">{fmtDay(u.lastSeen)}</td>
                      <td className="px-3 py-2 text-ink">{u.daysActive30}</td>
                      <td className="px-3 py-2 text-ink">{u.sessions}</td>
                      <td className="px-3 py-2 text-ink">{u.sessionMinutes}</td>
                      <td className="px-3 py-2 text-ink">{u.dwellMinutes}</td>
                      <td className="px-3 py-2 text-muted">
                        {u.streak}
                        {u.longestStreak > u.streak
                          ? ` · max ${u.longestStreak}`
                          : ""}
                      </td>
                      <td className="px-3 py-2 text-ink">{u.done30}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-semibold text-ink">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}
