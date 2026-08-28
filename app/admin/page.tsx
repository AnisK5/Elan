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

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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
        Rétention, séances, parcours — clique sur une personne pour le détail.
      </p>
      <Link
        href="/admin/analytics"
        className="mt-3 inline-flex rounded-xl border border-teal/30 bg-teal-soft/40 px-4 py-2 text-[14px] font-medium text-teal-ink transition hover:border-teal"
      >
        Dashboard tokens & séances →
      </Link>

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

      {t && snap && (
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

            <div className="mt-3 flex flex-col gap-2 sm:hidden">
              {snap.users.map((u) => (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className="rounded-2xl border border-line bg-surface px-4 py-3 transition hover:border-teal/40"
                >
                  <div className="font-medium text-ink">
                    {u.name || u.email || "—"}
                  </div>
                  {u.name ? (
                    <div className="text-[11px] text-faint">{u.email}</div>
                  ) : null}
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                    <span className="text-muted">
                      Vu <span className="text-ink">{fmtDay(u.lastSeen)}</span>
                    </span>
                    <span className="text-muted">
                      J/30 <span className="text-ink">{u.daysActive30}</span>
                    </span>
                    <span className="text-muted">
                      Séances <span className="text-ink">{u.sessions}</span>
                    </span>
                    <span className="text-muted">
                      Ouverts <span className="text-ink">{u.openThreads}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.activated ? (
                      <MiniBadge>Activé</MiniBadge>
                    ) : (
                      <MiniBadge>Dormant</MiniBadge>
                    )}
                    {u.notifyEnabled ? <MiniBadge>Notifs</MiniBadge> : null}
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-line bg-surface sm:block">
              <table className="w-full min-w-[880px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Personne</th>
                    <th className="px-3 py-2 font-medium">Inscrit</th>
                    <th className="px-3 py-2 font-medium">Vu</th>
                    <th className="px-3 py-2 font-medium">Jours / 30</th>
                    <th className="px-3 py-2 font-medium">Séances</th>
                    <th className="px-3 py-2 font-medium">Activé</th>
                    <th className="px-3 py-2 font-medium">Notifs</th>
                    <th className="px-3 py-2 font-medium">Ouverts</th>
                    <th className="px-3 py-2 font-medium">Réglés / 30</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.users.map((u) => (
                    <tr key={u.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="block transition hover:text-teal"
                        >
                          <div className="font-medium text-ink">
                            {u.name || u.email || "—"}
                          </div>
                          {u.name ? (
                            <div className="text-[11px] text-faint">{u.email}</div>
                          ) : null}
                        </Link>
                        <Link
                          href={`/admin/analytics?userId=${u.id}`}
                          className="mt-1 inline-block text-[11px] text-teal hover:underline"
                        >
                          tokens →
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted">{fmtDay(u.signedUp)}</td>
                      <td className="px-3 py-2 text-muted">{fmtDay(u.lastSeen)}</td>
                      <td className="px-3 py-2 text-ink">{u.daysActive30}</td>
                      <td className="px-3 py-2 text-ink">{u.sessions}</td>
                      <td className="px-3 py-2 text-muted">
                        {u.activated ? "oui" : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {u.notifyEnabled ? "oui" : "—"}
                      </td>
                      <td className="px-3 py-2 text-ink">{u.openThreads}</td>
                      <td className="px-3 py-2 text-ink">{u.done30}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {snap.recentFeedback.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold text-ink">
                Derniers retours
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {snap.recentFeedback.map((f) => (
                  <Link
                    key={f.id}
                    href={`/admin/users/${f.userId}`}
                    className="rounded-2xl border border-line bg-surface px-4 py-3 transition hover:border-teal/40"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
                      <span className="font-medium text-muted">
                        {f.name || f.email}
                      </span>
                      <span>{fmtWhen(f.createdAt)}</span>
                      {f.mood ? <span>· {f.mood}</span> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-ink">
                      {f.message}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
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

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-sink px-2 py-0.5 text-[10px] font-medium text-muted">
      {children}
    </span>
  );
}
