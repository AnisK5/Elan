"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CategoryChart,
  MetricGrid,
  TimeSeriesChart,
} from "@/components/admin/AnalyticsCharts";
import type {
  AdminProductSnapshot,
  ProductFilters,
  ProductGranularity,
  ProductTab,
} from "@/lib/admin-product";
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

const TABS: { id: ProductTab; label: string }[] = [
  { id: "overview", label: "Synthèse" },
  { id: "engagement", label: "Engagement" },
  { id: "retention", label: "Rétention" },
  { id: "acquisition", label: "Acquisition" },
  { id: "friction", label: "Frictions" },
];

const DAY_PRESETS = [1, 7, 30, 90] as const;

function parseTab(raw: string | null): ProductTab {
  if (
    raw === "engagement" ||
    raw === "retention" ||
    raw === "acquisition" ||
    raw === "friction" ||
    raw === "overview"
  ) {
    return raw;
  }
  return "overview";
}

function parseDays(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(1, n));
}

function buildQuery(f: ProductFilters): string {
  const p = new URLSearchParams();
  p.set("days", String(f.days));
  p.set("granularity", f.granularity);
  p.set("tab", f.tab);
  if (f.userId) p.set("userId", f.userId);
  const q = p.toString();
  return q ? `?${q}` : "";
}

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${n} %`;
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
        active ? "bg-teal text-paper" : "bg-sink text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {hint ? (
        <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function toPoints(
  rows: { label: string; value: number }[],
): { label: string; value: number }[] {
  return rows.map((r) => ({ label: r.label, value: r.value }));
}

export default function ProductDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo((): ProductFilters => {
    let days = parseDays(searchParams.get("days"));
    const granularity: ProductGranularity =
      searchParams.get("granularity") === "hour" ? "hour" : "day";
    if (granularity === "hour") days = Math.min(days, 7);
    return {
      days,
      granularity,
      userId: searchParams.get("userId"),
      tab: parseTab(searchParams.get("tab")),
    };
  }, [searchParams]);

  const [data, setData] = useState<AdminProductSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);
  const [loading, setLoading] = useState(true);

  const patch = useCallback(
    (p: Partial<ProductFilters>) => {
      const next = { ...filters, ...p };
      if (next.granularity === "hour" && next.days > 7) next.days = 7;
      router.push(`/admin/product${buildQuery(next)}`);
    },
    [filters, router],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminGet(`/api/admin/product${buildQuery(filters)}`)
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
        setError(null);
        setData((await res.json()) as AdminProductSnapshot);
      })
      .catch(() => {
        if (!cancelled) setError("fail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  if (error === "auth") {
    return (
      <p className="text-[15px] text-muted">
        Connecte-toi depuis l&apos;accueil pour voir ces chiffres.
      </p>
    );
  }
  if (error === "forbidden") {
    return (
      <p className="text-[15px] text-muted">
        Cette page n&apos;est pas ouverte pour ce compte.
      </p>
    );
  }
  if (error === "setup") {
    return (
      <p className="text-[15px] text-muted">
        Clé serveur Supabase manquante — recharge après relance.
      </p>
    );
  }
  if (error === "fail") {
    return (
      <p className="text-[15px] text-amber">
        Impossible de charger le dashboard produit.
      </p>
    );
  }
  if (loading && !data) {
    return <p className="text-sm text-faint">Chargement…</p>;
  }
  if (!data) return null;

  const k = data.kpis;
  const g = data.filters.granularity;
  const axisHint =
    g === "hour"
      ? "Axe = heures (Paris) · max 7 j"
      : `Axe = jours · ${data.filters.days} j`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Produit
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          Usage, temps, rétention, acquisition et frictions — pour piloter et
          pour une levée. Les courbes ont le temps en horizontal.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-sink/40 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Période
          </span>
          {DAY_PRESETS.map((d) => (
            <Chip
              key={d}
              active={filters.days === d && !(filters.granularity === "hour" && d > 7)}
              onClick={() =>
                patch({
                  days: filters.granularity === "hour" ? Math.min(d, 7) : d,
                })
              }
            >
              {d === 1 ? "24 h" : `${d} j`}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Granularité
          </span>
          <Chip
            active={filters.granularity === "day"}
            onClick={() => patch({ granularity: "day" })}
          >
            Par jour
          </Chip>
          <Chip
            active={filters.granularity === "hour"}
            onClick={() => patch({ granularity: "hour", days: Math.min(filters.days, 7) })}
          >
            Par heure
          </Chip>
          {filters.granularity === "hour" ? (
            <span className="text-[11px] text-faint">limité à 7 jours</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Personne
          </span>
          <select
            className="max-w-[16rem] rounded-lg border border-line bg-paper px-2 py-1.5 text-[13px] text-ink"
            value={filters.userId ?? ""}
            onChange={(e) =>
              patch({ userId: e.target.value || null })
            }
          >
            <option value="">Tout le monde</option>
            {data.users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name || u.email || u.userId.slice(0, 8)}
              </option>
            ))}
          </select>
          {filters.userId ? (
            <Link
              href={`/admin/users/${filters.userId}`}
              className="text-[12px] text-teal hover:underline"
            >
              Fiche →
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => patch({ tab: tab.id })}
            className={`rounded-t-lg px-3 py-2 text-[13px] font-medium transition ${
              filters.tab === tab.id
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {filters.tab === "overview" ? (
        <>
          <MetricGrid
            items={[
              {
                label: "Inscrits",
                value: String(k.signups),
                hint: `+${k.signups7} / 7 j`,
              },
              { label: "DAU", value: String(k.dau) },
              { label: "WAU", value: String(k.wau) },
              {
                label: "Stickiness",
                value: pct(k.stickiness),
                hint: "DAU / MAU",
              },
              { label: "Rétention J7", value: pct(k.d7) },
              {
                label: "Récurrents 7 j",
                value: String(k.returning7),
                hint: "déjà inscrits avant",
              },
              {
                label: "Temps séances",
                value: `${k.sessionMinPeriod} min`,
                hint: `période · ${k.sessionsPeriod} séances`,
              },
              {
                label: "Risque churn",
                value: pct(k.churnRiskPct),
                hint: `${k.dormant14} dormants ≥14 j`,
              },
              {
                label: "Frictions",
                value: String(k.planBlocksPeriod + k.highLatencyPeriod),
                hint: "plafonds + latences",
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Actifs dans le temps" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.activeUsers)}
                valueLabel="Actifs"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard title="Inscriptions" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.signups)}
                valueLabel="Signups"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard
              title="Minutes de séance"
              hint={`${axisHint} · durée réelle`}
            >
              <TimeSeriesChart
                points={toPoints(data.series.sessionMinutes)}
                valueLabel="Minutes"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard
              title="Utilisateurs récurrents"
              hint="Déjà inscrits avant le créneau"
            >
              <TimeSeriesChart
                points={toPoints(data.series.returningUsers)}
                valueLabel="Récurrents"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
          </div>
        </>
      ) : null}

      {filters.tab === "engagement" ? (
        <>
          <MetricGrid
            items={[
              {
                label: "Séances",
                value: String(k.sessionsPeriod),
                hint: "période",
              },
              {
                label: "Durée moy.",
                value: `${k.avgSessionMin} min`,
              },
              {
                label: "Minutes séance",
                value: `${k.sessionMinPeriod} min`,
              },
              {
                label: "Temps dans l'app",
                value: `${k.dwellMinPeriod} min`,
                hint: "dwell",
              },
              {
                label: "Passages",
                value: String(k.passagesPeriod),
                hint: "séance ou aside",
              },
              {
                label: "Séances / actif 7 j",
                value: String(k.sessionsPerActive7),
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Séances" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.sessions)}
                valueLabel="Séances"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard title="Passages (séance + aside)" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.passages)}
                valueLabel="Passages"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard title="Minutes de séance" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.sessionMinutes)}
                valueLabel="Minutes"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard title="Temps dans l'app (dwell)" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.dwellMinutes)}
                valueLabel="Minutes"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
          </div>
        </>
      ) : null}

      {filters.tab === "retention" ? (
        <>
          <MetricGrid
            items={[
              { label: "J1", value: pct(k.d1) },
              { label: "J7", value: pct(k.d7) },
              { label: "J30", value: pct(k.d30) },
              { label: "Activés", value: pct(k.activatedPct) },
              {
                label: "Récurrents 7 j",
                value: String(k.returning7),
              },
              {
                label: "Dormants ≥14 j",
                value: String(k.dormant14),
                hint: pct(k.churnRiskPct) + " des activés",
              },
            ]}
          />
          <ChartCard
            title="Récurrence dans le temps"
            hint="Personnes déjà inscrites qui reviennent"
          >
            <TimeSeriesChart
              points={toPoints(data.series.returningUsers)}
              valueLabel="Récurrents"
              format="number"
              maxPoints={g === "hour" ? 168 : 90}
            />
          </ChartCard>
          <section className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <div className="px-4 py-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Cohortes d&apos;inscription (semaines)
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                % revenus exactement à J1 / J7 / J14 après signup.
              </p>
            </div>
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2">Semaine</th>
                  <th className="px-4 py-2">Taille</th>
                  <th className="px-4 py-2">J1</th>
                  <th className="px-4 py-2">J7</th>
                  <th className="px-4 py-2">J14</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.week} className="border-t border-line">
                    <td className="px-4 py-2 font-medium text-ink">
                      {c.label}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{c.size}</td>
                    <td className="px-4 py-2 tabular-nums">{pct(c.d1)}</td>
                    <td className="px-4 py-2 tabular-nums">{pct(c.d7)}</td>
                    <td className="px-4 py-2 tabular-nums">{pct(c.d14)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <div className="px-4 py-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Dormants (churn soft)
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                Au moins 1 séance, plus d&apos;activité depuis ≥14 jours.
              </p>
            </div>
            {data.dormant.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-muted">Aucun pour l&apos;instant.</p>
            ) : (
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-4 py-2">Personne</th>
                    <th className="px-4 py-2">Dernière activité</th>
                    <th className="px-4 py-2">Jours</th>
                    <th className="px-4 py-2">Séances</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dormant.map((u) => (
                    <tr key={u.userId} className="border-t border-line">
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/users/${u.userId}`}
                          className="font-medium text-teal hover:underline"
                        >
                          {u.name || u.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {u.lastSeen ?? "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{u.daysSince}</td>
                      <td className="px-4 py-2 tabular-nums">{u.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}

      {filters.tab === "acquisition" ? (
        <>
          <MetricGrid
            items={[
              {
                label: "Inscrits",
                value: String(k.signups),
                hint: `+${k.signups7} / 7 j`,
              },
              { label: "Activés", value: pct(k.activatedPct) },
              {
                label: "Canaux connus",
                value: String(
                  data.acquisition.filter((a) => a.label !== "Inconnu").length,
                ),
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Inscriptions dans le temps" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.signups)}
                valueLabel="Signups"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard
              title="Canaux"
              hint="Questionnaire + UTM / ref"
            >
              <CategoryChart
                mode="value"
                points={data.acquisition.map((a) => ({
                  label: a.label,
                  value: a.value,
                }))}
              />
            </ChartCard>
          </div>
          <ChartCard
            title="Entonnoir"
            hint="Inscrit → ouverture → passage → séance → action faite"
          >
            <CategoryChart
              mode="value"
              points={data.funnel.map((f) => ({
                label: f.label,
                value: f.value,
              }))}
            />
          </ChartCard>
        </>
      ) : null}

      {filters.tab === "friction" ? (
        <>
          <MetricGrid
            items={[
              {
                label: "Plafonds plan",
                value: String(k.planBlocksPeriod),
                hint: "dépassements / h",
              },
              {
                label: "Latences ≥12s",
                value: String(k.highLatencyPeriod),
              },
              {
                label: "Journal",
                value: String(data.frictionJournal.length),
                hint: "événements récents",
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Dépassements plan / heure"
              hint={`${axisHint} · ligne = plafond configuré côté Monitoring`}
            >
              <TimeSeriesChart
                points={toPoints(data.series.planBlocks)}
                valueLabel="Dépassements"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard title="Latences élevées" hint={axisHint}>
              <TimeSeriesChart
                points={toPoints(data.series.highLatency)}
                valueLabel="Appels lents"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
            <ChartCard
              title="Arrêts anormaux"
              hint="max_tokens / error / overloaded"
            >
              <TimeSeriesChart
                points={toPoints(data.series.stopAnomalies)}
                valueLabel="Arrêts"
                format="number"
                maxPoints={g === "hour" ? 168 : 90}
              />
            </ChartCard>
          </div>
          <section className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <div className="px-4 py-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Journal des frictions
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                Moments où l&apos;expérience a pu casser (plafond, lenteur,
                alerte).
              </p>
            </div>
            {data.frictionJournal.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-muted">
                Rien de notable sur la période.
              </p>
            ) : (
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-4 py-2">Quand</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Personne</th>
                    <th className="px-4 py-2">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.frictionJournal.map((f, i) => (
                    <tr
                      key={`${f.at}-${f.kind}-${i}`}
                      className="border-t border-line"
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-muted">
                        {new Date(f.at).toLocaleString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2 font-medium text-ink">
                        {f.label}
                      </td>
                      <td className="px-4 py-2">
                        {f.userId ? (
                          <Link
                            href={`/admin/users/${f.userId}`}
                            className="text-teal hover:underline"
                          >
                            {f.userLabel}
                          </Link>
                        ) : (
                          f.userLabel
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted">{f.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
