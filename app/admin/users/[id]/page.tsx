"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/home/Branding";
import { AssistantSpeech } from "@/components/HighlightEncart";
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

export default function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
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
    adminGet(`/api/admin/users/${userId}`)
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
        if (res.status === 404) {
          setError("notfound");
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
        setDetail((await res.json()) as AdminUserDetail);
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
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
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
              {e.feedbackCount > 0 ? (
                <Badge>{e.feedbackCount} retour{e.feedbackCount > 1 ? "s" : ""}</Badge>
              ) : null}
            </div>
          </div>

          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <Card title="Profil">
              <Row label="Inscrit" value={fmtDay(p.signedUp)} />
              <Row label="Vu" value={fmtDay(e.lastSeen)} />
              <Row
                label="Dernière séance"
                value={fmtDay(e.lastSessionAt)}
              />
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
              {detail.backlog.recent.length > 0 ? (
                <ul className="mt-2 space-y-1.5 border-t border-line pt-2">
                  {detail.backlog.recent.map((t) => (
                    <li key={t.id} className="text-[12px] text-muted">
                      <span className="text-faint">{t.status} · </span>
                      {t.text}
                    </li>
                  ))}
                </ul>
              ) : null}
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
          </section>

          {detail.feedbacks.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold text-ink">
                Retours
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {detail.feedbacks.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-2xl border border-line bg-surface px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
                      <span>{fmtWhen(f.createdAt)}</span>
                      {f.mood ? <span>· {f.mood}</span> : null}
                      <span>· {f.source}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                      {f.message}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">
              Parcours
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {detail.timeline.slice(0, 40).map((entry, i) => (
                <div
                  key={`${entry.at}-${entry.kind}-${i}`}
                  className="flex gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <div className="w-[110px] shrink-0 text-[11px] leading-snug text-faint">
                    {fmtWhen(entry.at)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">
                      {entry.label}
                    </div>
                    {entry.detail ? (
                      <div className="mt-0.5 truncate text-[12px] text-muted">
                        {entry.detail}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">
              Séances ({detail.sessions.length})
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {detail.sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-line bg-surface"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSession(openSession === s.id ? null : s.id)
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-ink">
                        {fmtWhen(s.date)}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted">
                        {s.durationMin} min · {s.messageCount} messages
                        {s.context ? ` · ${s.context}` : ""}
                      </div>
                    </div>
                    <span className="text-faint">
                      {openSession === s.id ? "▲" : "▼"}
                    </span>
                  </button>
                  {openSession === s.id ? (
                    <div className="border-t border-line px-3 py-3">
                      <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto">
                        {s.transcript.map((m, i) => (
                          <div
                            key={i}
                            className={
                              m.role === "user"
                                ? "flex justify-end"
                                : "flex justify-start"
                            }
                          >
                            {m.role === "user" ? (
                              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sink px-3.5 py-2 text-[14px] leading-relaxed text-ink">
                                {m.content}
                              </div>
                            ) : (
                              <div className="max-w-[92%] px-1 py-1">
                                <AssistantSpeech
                                  content={m.content}
                                  className="whitespace-pre-wrap text-[14px] leading-relaxed text-teal-ink"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
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
