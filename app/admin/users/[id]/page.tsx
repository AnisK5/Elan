"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import UserConversationsPanel from "@/components/admin/UserConversationsPanel";
import {
  ActivityWeightStrip,
  WeightedDayFrise,
} from "@/components/admin/UserTimelineFrise";
import { Logo } from "@/components/home/Branding";
import type { AdminAnalyticsSnapshot } from "@/lib/admin-analytics";
import type { AdminUserDetail } from "@/lib/admin-user-detail";
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

const SECTIONS = [
  { id: "frise", label: "Frise" },
  { id: "conversations", label: "Conversations" },
  { id: "trucs", label: "Trucs" },
  { id: "usage", label: "Appels IA" },
  { id: "profil", label: "Profil" },
] as const;

export default function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSnapshot | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | "notfound" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (!cancelled) setUserId(p.id);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      adminGet(`/api/admin/users/${userId}`),
      adminGet(`/api/admin/analytics?userId=${userId}`),
    ])
      .then(async ([detailRes, analyticsRes]) => {
        if (cancelled) return;
        if (detailRes.status === 401) {
          setError("auth");
          return;
        }
        if (detailRes.status === 403) {
          setError("forbidden");
          return;
        }
        if (detailRes.status === 404) {
          setError("notfound");
          return;
        }
        if (detailRes.status === 503) {
          setError("setup");
          return;
        }
        if (!detailRes.ok) {
          setError("fail");
          return;
        }
        setDetail((await detailRes.json()) as AdminUserDetail);
        if (analyticsRes.ok) {
          setAnalytics((await analyticsRes.json()) as AdminAnalyticsSnapshot);
        }
      })
      .catch(() => {
        if (!cancelled) setError("fail");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const p = detail?.profile;
  const e = detail?.engagement;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-5 pb-20">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold text-ink">
            Élan
          </span>
        </Link>
        <Link
          href="/admin"
          className="text-sm text-muted transition hover:text-ink"
        >
          Stats
        </Link>
      </header>

      {error === "auth" && (
        <p className="mt-4 text-[15px] text-muted">Connecte-toi pour voir cette fiche.</p>
      )}
      {error === "forbidden" && (
        <p className="mt-4 text-[15px] text-muted">Accès refusé.</p>
      )}
      {error === "notfound" && (
        <p className="mt-4 text-[15px] text-muted">Utilisateur introuvable.</p>
      )}
      {error === "setup" && (
        <p className="mt-4 text-[15px] text-muted">Configuration serveur incomplète.</p>
      )}
      {error === "fail" && (
        <p className="mt-4 text-[15px] text-amber">Impossible de charger la fiche.</p>
      )}

      {!error && !detail && (
        <p className="mt-8 text-sm text-faint">Chargement…</p>
      )}

      {p && e && detail && (
        <>
          <div className="mt-2">
            <Link
              href="/admin"
              className="text-[13px] text-muted transition hover:text-ink"
            >
              ← Tous les inscrits
            </Link>
            <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
              {p.name || p.email}
            </h1>
            {p.name ? (
              <p className="mt-0.5 text-[14px] text-muted">{p.email}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{e.activated ? "Activé" : "Pas encore de séance"}</Badge>
              {e.notifyEnabled ? <Badge>Notifs</Badge> : null}
              {detail.totals.weightMin90 > 0 ? (
                <Badge>{detail.totals.weightMin90} min pond. (90 j)</Badge>
              ) : null}
              {detail.totals.tokensTotal > 0 ? (
                <Badge>
                  {detail.totals.tokensTotal.toLocaleString("fr-FR")} tok
                </Badge>
              ) : null}
            </div>
          </div>

          <nav className="sticky top-0 z-20 -mx-5 mt-6 flex gap-1 overflow-x-auto border-b border-line bg-paper/95 px-5 py-2 backdrop-blur-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sink hover:text-ink"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <section id="frise" className="mt-8 scroll-mt-24">
            <h2 className="font-display text-lg font-semibold text-ink">
              Frise temporelle
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Chaque jour est pondéré par le temps passé (dwell, séances) et les
              actions. Clique un jour pour le détail.
            </p>

            <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Calendrier d&apos;intensité (90 j)
              </h3>
              <div className="mt-3">
                <ActivityWeightStrip days={detail.activityDays} />
              </div>
            </div>

            <div className="mt-4">
              <WeightedDayFrise
                bands={detail.dayBands}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            </div>
          </section>

          <section id="conversations" className="mt-12 scroll-mt-24">
            <h2 className="font-display text-lg font-semibold text-ink">
              Conversations (séances)
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Transcripts complets, échange par échange. Le chat « info en passant
              » sur l&apos;accueil reste local — non visible ici.
            </p>
            <div className="mt-4">
              <UserConversationsPanel sessions={detail.sessions} />
            </div>
          </section>

          <section id="trucs" className="mt-12 scroll-mt-24">
            <h2 className="font-display text-lg font-semibold text-ink">
              Tous les trucs ({detail.threads.length})
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {detail.threads.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
                    <span className="rounded bg-sink px-1.5 py-0.5 text-muted">
                      {t.status}
                    </span>
                    <span>{t.kind}</span>
                    {t.effort ? <span>· effort {t.effort}</span> : null}
                    <span>· déposé {fmtDay(t.createdAt)}</span>
                    {t.doneAt ? <span>· réglé {fmtDay(t.doneAt)}</span> : null}
                    {t.touchedAt ? (
                      <span>· travaillé {fmtDay(t.touchedAt)}</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[14px] font-medium text-ink">
                    {t.text}
                  </p>
                  {t.note ? (
                    <p className="mt-1 text-[12px] text-muted">{t.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section id="usage" className="mt-12 scroll-mt-24">
            <h2 className="font-display text-lg font-semibold text-ink">
              Appels IA ({detail.usageLog.length})
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Chaque tour Claude — route, tokens, type d&apos;échange. Vide tant
              que la migration <code className="text-ink">elan_api_usage</code>{" "}
              n&apos;est pas passée.
            </p>
            {detail.usageLog.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[640px] text-left text-[12px]">
                  <thead className="text-[10px] uppercase tracking-wide text-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Quand</th>
                      <th className="px-3 py-2 font-medium">Route</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2 font-medium">Modèle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.usageLog.slice(0, 80).map((u) => (
                      <tr key={u.id} className="border-t border-line">
                        <td className="px-3 py-2 text-muted">
                          {fmtWhen(u.at)}
                        </td>
                        <td className="px-3 py-2 text-ink">{u.route}</td>
                        <td className="px-3 py-2 text-muted">
                          {u.exchangeKind ?? "—"}
                          {u.exchangeIndex != null ? ` #${u.exchangeIndex}` : ""}
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {(u.inputTokens + u.outputTokens).toLocaleString(
                            "fr-FR",
                          )}
                        </td>
                        <td className="px-3 py-2 text-faint">{u.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-4 text-[13px] text-muted">
                Aucun appel enregistré pour l&apos;instant.
              </p>
            )}

            {detail.feedbacks.length > 0 ? (
              <div className="mt-8">
                <h3 className="font-display text-base font-semibold text-ink">
                  Retours ({detail.feedbacks.length})
                </h3>
                <div className="mt-3 flex flex-col gap-2">
                  {detail.feedbacks.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-line bg-surface px-4 py-3"
                    >
                      <div className="text-[11px] text-faint">
                        {fmtWhen(f.createdAt)}
                        {f.mood ? ` · ${f.mood}` : ""} · {f.source}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink">
                        {f.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section id="profil" className="mt-12 scroll-mt-24">
            <h2 className="font-display text-lg font-semibold text-ink">
              Profil & engagement
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Card title="Profil">
                <Row label="Inscrit" value={fmtDay(p.signedUp)} />
                <Row label="Vu" value={fmtDay(e.lastSeen)} />
                <Row label="Dernière séance" value={fmtDay(e.lastSessionAt)} />
                <Row
                  label="Créneau habituel"
                  value={`${p.defaultDurationMin} min · ${p.notifyTimezone}`}
                />
                {p.situation ? (
                  <Row
                    label="Situation"
                    value={
                      p.situationUntil
                        ? `${p.situation} (jusqu'au ${fmtDay(p.situationUntil)})`
                        : p.situation
                    }
                  />
                ) : null}
              </Card>
              <Card title="Engagement (30 j)">
                <Row label="Jours actifs" value={String(e.daysActive30)} />
                <Row label="Séances" value={String(e.sessions)} />
                <Row label="Minutes séance" value={String(e.sessionMinutes)} />
                <Row label="Dwell" value={`${e.dwellMinutes} min`} />
                <Row label="Réglés" value={String(e.done30)} />
                <Row
                  label="Suite"
                  value={
                    e.longestStreak > e.streak
                      ? `${e.streak} · max ${e.longestStreak}`
                      : String(e.streak)
                  }
                />
              </Card>
              <Card title="Backlog">
                <Row label="Ouverts" value={String(detail.backlog.open)} />
                <Row label="En pause" value={String(detail.backlog.snoozed)} />
                <Row label="Réglés" value={String(detail.backlog.done)} />
              </Card>
              <Card title="Notifs">
                <Row
                  label="Push"
                  value={detail.notifs.pushEnabled ? "Oui" : "Non"}
                />
                <Row
                  label="Email"
                  value={detail.notifs.emailEnabled ? "Oui" : "Non"}
                />
                <Row label="Heure" value={detail.notifs.notifyTime} />
                <Row
                  label="Appareil inscrit"
                  value={detail.notifs.hasPushSub ? "Oui" : "Non"}
                />
              </Card>
            </div>

            {analytics ? (
              <div className="mt-8">
                <h3 className="font-display text-base font-semibold text-ink">
                  Graphiques tokens
                </h3>
                <div className="mt-4">
                  <AnalyticsDashboard data={analytics} compact />
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
