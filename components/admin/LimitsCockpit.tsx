"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEur, estimateEurFromTotalTokens } from "@/lib/anthropic-pricing";
import { formatTokensWithEur } from "@/lib/token-display";
import { getSupabase } from "@/lib/supabase";

interface PersonLimitRow {
  userId: string;
  email: string;
  name?: string;
  todayTokens: number;
  todayCostEur: number;
  weekTokens: number;
  weekCostEur: number;
  planCallsToday: number;
  planCallsLastHour?: number;
  override: { dailyTokens: number | null; planPerHour: number | null };
  effectiveDailyTokens: number;
  effectivePlanPerHour: number;
  dailyPct: number;
  customDaily: boolean;
  customPlan: boolean;
}

interface LimitsPayload {
  day: string;
  defaults: {
    dailyTokens: number;
    dailyTokensSource: "db" | "env";
    planPerHour: number;
    planPerHourSource: "db" | "env";
  };
  people: PersonLimitRow[];
  presets: { dailyTokens: number[]; planPerHour: number[] };
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers });
}

function Gauge({
  pct,
  label,
  sub,
  tone,
}: {
  pct: number;
  label: string;
  sub?: string;
  tone: "ok" | "warn" | "hot" | "off";
}) {
  const capped = Math.min(100, Math.max(0, pct));
  const color =
    tone === "hot"
      ? "var(--color-amber)"
      : tone === "warn"
        ? "var(--color-amber)"
        : tone === "off"
          ? "var(--color-line)"
          : "var(--color-teal)";
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (capped / 100) * c;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden>
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="var(--color-sink)"
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 48 48)"
        />
        <text
          x="48"
          y="52"
          textAnchor="middle"
          fill="var(--color-ink)"
          fontSize="16"
          fontWeight="600"
        >
          {tone === "off" ? "∞" : `${Math.round(pct)}%`}
        </text>
      </svg>
      <p className="text-center text-[12px] font-medium text-ink">{label}</p>
      {sub ? (
        <p className="max-w-[9rem] text-center text-[10px] leading-snug text-faint">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
  danger,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? danger
            ? "bg-amber text-paper"
            : "bg-teal text-paper"
          : "bg-sink text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function fmtLimit(n: number, kind: "tokens" | "plan"): string {
  if (kind === "tokens") {
    if (n === 0) return "Illimité";
    return formatTokensWithEur(n, estimateEurFromTotalTokens(n));
  }
  if (n === 0) return "Off";
  return `${n}/h`;
}

export default function LimitsCockpit() {
  const [data, setData] = useState<LimitsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "custom" | "risk">(
    "active",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/limits");
      if (!res.ok) {
        setError("Impossible de charger les plafonds.");
        setLoading(false);
        return;
      }
      setData((await res.json()) as LimitsPayload);
    } catch {
      setError("Impossible de charger les plafonds.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchGlobal(body: {
    dailyTokens?: number;
    planPerHour?: number;
  }) {
    setBusy("global");
    const res = await adminFetch("/api/admin/limits", {
      method: "PATCH",
      body: JSON.stringify({ scope: "global", ...body }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError("Enregistrement global impossible.");
      return;
    }
    await load();
  }

  async function patchUser(
    userId: string,
    body: { dailyTokens?: number | null; planPerHour?: number | null },
  ) {
    setBusy(userId);
    const res = await adminFetch("/api/admin/limits", {
      method: "PATCH",
      body: JSON.stringify({ scope: "user", userId, ...body }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError("Enregistrement user impossible.");
      return;
    }
    await load();
  }

  const people = useMemo(() => {
    if (!data) return [];
    return data.people.filter((p) => {
      if (filter === "all") return true;
      if (filter === "custom") return p.customDaily || p.customPlan;
      if (filter === "risk") return p.dailyPct >= 70 || (p.planCallsLastHour ?? 0) >= Math.max(1, p.effectivePlanPerHour * 0.7);
      return p.weekTokens > 0 || p.todayTokens > 0 || p.customDaily || p.customPlan;
    });
  }, [data, filter]);

  if (loading && !data) {
    return <p className="text-sm text-faint">Chargement du pilotage…</p>;
  }
  if (error && !data) {
    return <p className="text-[15px] text-amber">{error}</p>;
  }
  if (!data) return null;

  const d = data.defaults;

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-[13px] text-amber">{error}</p> : null}

      <section>
        <h3 className="font-display text-lg font-semibold text-ink">
          Défauts pour tout le monde
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          Sauf override perso ci-dessous. Soft sur les tokens (alerte) · hard sur
          le plan/heure (bloque Sonnet).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Tokens / jour
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {fmtLimit(d.dailyTokens, "tokens")}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              source {d.dailyTokensSource}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.presets.dailyTokens.map((n) => (
                <Chip
                  key={n}
                  active={d.dailyTokens === n}
                  danger={n === 0}
                  onClick={() => void patchGlobal({ dailyTokens: n })}
                >
                  {n === 0 ? "∞" : `${Math.round(n / 1000)}k`}
                </Chip>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Plans / heure
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {fmtLimit(d.planPerHour, "plan")}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              source {d.planPerHourSource} · anti-boucle
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.presets.planPerHour.map((n) => (
                <Chip
                  key={n}
                  active={d.planPerHour === n}
                  danger={n === 0}
                  onClick={() => void patchGlobal({ planPerHour: n })}
                >
                  {n === 0 ? "off" : `${n}/h`}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        {busy === "global" ? (
          <p className="mt-2 text-[12px] text-teal">Enregistrement…</p>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              Par personne
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Usage aujourd&apos;hui ({data.day}) vs plafond — ajuste si quelqu&apos;un
              est à l&apos;étroit ou trop large.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["active", "Actifs"],
                ["risk", "À risque"],
                ["custom", "Perso"],
                ["all", "Tous"],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {people.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-line bg-surface px-4 py-6 text-[13px] text-muted">
              Personne dans ce filtre.
            </p>
          ) : (
            people.map((p) => {
              const unlimited = p.effectiveDailyTokens === 0;
              const tone: "ok" | "warn" | "hot" | "off" = unlimited
                ? "off"
                : p.dailyPct >= 90
                  ? "hot"
                  : p.dailyPct >= 70
                    ? "warn"
                    : "ok";
              const label = p.name || p.email || p.userId.slice(0, 8);
              return (
                <article
                  key={p.userId}
                  className={`rounded-2xl border bg-surface p-4 ${
                    tone === "hot"
                      ? "border-amber/50"
                      : "border-line"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{label}</p>
                      {p.name ? (
                        <p className="truncate text-[11px] text-faint">{p.email}</p>
                      ) : null}
                      <Link
                        href={`/admin/users/${p.userId}`}
                        className="mt-0.5 inline-block text-[11px] text-teal hover:underline"
                      >
                        Fiche →
                      </Link>
                    </div>
                    {(p.customDaily || p.customPlan) && (
                      <span className="shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-medium text-teal-ink">
                        perso
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex justify-center">
                    <Gauge
                      pct={unlimited ? 0 : p.dailyPct}
                      tone={tone}
                      label="Quota jour"
                      sub={
                        unlimited
                          ? "Illimité"
                          : `${p.todayTokens.toLocaleString("fr-FR")} / ${p.effectiveDailyTokens.toLocaleString("fr-FR")} tok`
                      }
                    />
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px]">
                    <div className="rounded-xl bg-sink/80 px-2 py-2">
                      <p className="text-faint">Aujourd&apos;hui</p>
                      <p className="font-medium tabular-nums text-ink">
                        {formatEur(p.todayCostEur)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-sink/80 px-2 py-2">
                      <p className="text-faint">7 jours</p>
                      <p className="font-medium tabular-nums text-ink">
                        {formatEur(p.weekCostEur)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-sink/80 px-2 py-2">
                      <p className="text-faint">Plans / h</p>
                      <p className="font-medium tabular-nums text-ink">
                        {p.planCallsLastHour ?? "—"} /{" "}
                        {p.effectivePlanPerHour === 0
                          ? "∞"
                          : p.effectivePlanPerHour}
                      </p>
                    </div>
                    <div className="rounded-xl bg-sink/80 px-2 py-2">
                      <p className="text-faint">Plans jour</p>
                      <p className="font-medium tabular-nums text-ink">
                        {p.planCallsToday}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
                      Tokens / jour
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Chip
                        active={!p.customDaily}
                        onClick={() =>
                          void patchUser(p.userId, { dailyTokens: null })
                        }
                      >
                        Défaut
                      </Chip>
                      {data.presets.dailyTokens.map((n) => (
                        <Chip
                          key={n}
                          active={p.override.dailyTokens === n}
                          danger={n === 0}
                          onClick={() =>
                            void patchUser(p.userId, { dailyTokens: n })
                          }
                        >
                          {n === 0 ? "∞" : `${Math.round(n / 1000)}k`}
                        </Chip>
                      ))}
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
                      Plans / heure
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Chip
                        active={!p.customPlan}
                        onClick={() =>
                          void patchUser(p.userId, { planPerHour: null })
                        }
                      >
                        Défaut
                      </Chip>
                      {data.presets.planPerHour.map((n) => (
                        <Chip
                          key={n}
                          active={p.override.planPerHour === n}
                          danger={n === 0}
                          onClick={() =>
                            void patchUser(p.userId, { planPerHour: n })
                          }
                        >
                          {n === 0 ? "off" : `${n}/h`}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {busy === p.userId ? (
                    <p className="mt-2 text-[11px] text-teal">…</p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
