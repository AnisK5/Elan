"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import type { AdminAnalyticsSnapshot, UserTokenRow } from "@/lib/admin-analytics";
import { formatEur } from "@/lib/anthropic-pricing";
import {
  CategoryChart,
  HourHeatmap,
  MetricGrid,
  TimeSeriesChart,
} from "@/components/admin/AnalyticsCharts";
import TokensCost from "@/components/admin/TokensCost";
import UserTokenTable from "@/components/admin/UserTokenTable";
import LimitsCockpit from "@/components/admin/LimitsCockpit";

export type MonitorTab =
  | "overview"
  | "hourly"
  | "routes"
  | "journal"
  | "limits"
  | "pilotage";

export interface MonitorFilters {
  days: number;
  route: string;
  model: string;
  day: string;
  tab: MonitorTab;
  userId: string | null;
}

function fmtDay(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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

const TABS: { id: MonitorTab; label: string }[] = [
  { id: "pilotage", label: "Pilotage" },
  { id: "overview", label: "Vue d'ensemble" },
  { id: "hourly", label: "Par heure" },
  { id: "routes", label: "Routes" },
  { id: "journal", label: "Journal" },
  { id: "limits", label: "Plafonds live" },
];

const DAY_PRESETS = [
  { label: "Aujourd'hui", days: 1 },
  { label: "7 j", days: 7 },
  { label: "30 j", days: 30 },
  { label: "90 j", days: 90 },
] as const;

function FilterBar({
  filters,
  onChange,
  routes,
  models,
}: {
  filters: MonitorFilters;
  onChange: (patch: Partial<MonitorFilters>) => void;
  routes: string[];
  models: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
          Période
        </span>
        {DAY_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() =>
              onChange({ days: p.days, day: "", tab: filters.tab })
            }
            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
              !filters.day && filters.days === p.days
                ? "bg-ink text-paper"
                : "bg-sink text-muted hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          value={filters.day}
          onChange={(e) =>
            onChange({ day: e.target.value, tab: filters.tab })
          }
          className="rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink"
          title="Jour précis (UTC)"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-faint">
          Route
          <select
            value={filters.route}
            onChange={(e) => onChange({ route: e.target.value })}
            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="all">Toutes</option>
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-faint">
          Modèle
          <select
            value={filters.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="all">Tous</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m.replace("claude-", "")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function UsageMonitorDashboard({
  data,
  filters,
  onFiltersChange,
  globalUsers,
  onSelectUser,
  userLinkPrefix = "/admin/users/",
}: {
  data: AdminAnalyticsSnapshot;
  filters: MonitorFilters;
  onFiltersChange: (patch: Partial<MonitorFilters>) => void;
  globalUsers: UserTokenRow[];
  onSelectUser?: (userId: string | null) => void;
  userLinkPrefix?: string;
}) {
  const t = data.totals;
  const mon = data.monitor;
  const planLimit = mon.planCallsPerHourLimit;
  const viewUser = data.viewUser;
  const viewLabel = viewUser?.name || viewUser?.email;
  const scopeHint = viewLabel ? ` — ${viewLabel}` : "";
  const userRows = globalUsers.length > 0 ? globalUsers : data.tokensByUser;

  const hourlyChartRows = useMemo(() => {
    if (filters.route !== "all") {
      return mon.hourlyByRoute
        .filter((r) => r.route === filters.route)
        .map((r) => ({
          label: r.hourLabel,
          total: r.total,
          costEur: r.costEur,
          calls: r.calls,
          planCalls: r.route === "plan" ? r.calls : 0,
        }));
    }
    return mon.hourly.map((h) => ({
      label: h.hourLabel,
      total: h.total,
      costEur: h.costEur,
      calls: h.calls,
      planCalls: h.byRoute.plan ?? 0,
    }));
  }, [mon.hourly, mon.hourlyByRoute, filters.route]);

  const setTab = useCallback(
    (tab: MonitorTab) => onFiltersChange({ tab }),
    [onFiltersChange],
  );

  if (t.apiCalls === 0 && t.sessions === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-[14px] text-muted">
        Pas encore de données — migration{" "}
        <code className="text-ink">elan_api_usage</code> puis usage connecté.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {filters.tab !== "pilotage" ? (
        <FilterBar
          filters={filters}
          onChange={onFiltersChange}
          routes={mon.availableRoutes}
          models={mon.availableModels}
        />
      ) : null}

      {mon.anomalies.length > 0 ? (
        <div className="rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3">
          <p className="text-[13px] font-medium text-ink">Alertes détectées</p>
          <ul className="mt-2 space-y-1 text-[12px] text-muted">
            {mon.anomalies.slice(0, 6).map((a) => (
              <li key={`${a.kind}-${a.hourKey}`}>
                <span className="font-medium text-ink">{a.hourLabel}</span> —{" "}
                {a.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-line pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
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

      {filters.tab === "pilotage" ? <LimitsCockpit /> : null}

      {filters.tab === "overview" ? (
        <>
          {viewUser ? (
            <div className="rounded-2xl border border-teal/30 bg-teal-soft/30 px-4 py-3">
              <p className="text-[14px] text-ink">
                Vue filtrée :{" "}
                <span className="font-semibold">{viewLabel}</span>
              </p>
            </div>
          ) : null}

          {!viewUser && userRows.length > 0 ? (
            <section>
              <h3 className="font-display text-lg font-semibold text-ink">
                Par personne
              </h3>
              <div className="mt-3">
                <UserTokenTable
                  rows={userRows}
                  selectedUserId={filters.userId}
                  onSelectUser={onSelectUser}
                  userLinkPrefix={userLinkPrefix}
                />
              </div>
            </section>
          ) : null}

          <MetricGrid
            items={[
              {
                label: "Coût estimé",
                value: formatEur(t.costEur),
                hint: `~${t.costUsd.toFixed(2)} $ · ${data.filters.days} j`,
              },
              {
                label: "Plafond / jour",
                value:
                  data.dailyLimitEur > 0
                    ? formatEur(data.dailyLimitEur)
                    : "Illimité",
                hint:
                  data.dailyTokenLimit > 0
                    ? `≈ ${Math.round(data.dailyTokenLimit / 1000)}k tok`
                    : "pas de soft limit",
              },
              {
                label: "Appels API",
                value: String(t.apiCalls),
                hint: `${t.totalTokens.toLocaleString("fr-FR")} tok`,
              },
              {
                label: "Plans (période)",
                value: String(
                  data.tokensByRoute.find((r) => r.route === "plan")?.calls ??
                    0,
                ),
                hint:
                  planLimit > 0
                    ? `plafond ${planLimit}/h`
                    : "plafond désactivé",
              },
              {
                label: "Séances",
                value: String(t.sessions),
                hint: `~${t.avgSessionMin} min`,
              },
            ]}
          />

          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Coût par jour (€){scopeHint}
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Axe horizontal = jours · ligne pointillée = plafond journalier
              estimé.
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <TimeSeriesChart
                points={data.tokensByDay.map((d) => ({
                  label: fmtDay(d.day),
                  value: d.costEur,
                  secondary: d.total,
                  secondaryLabel: "Tokens",
                }))}
                valueLabel="Coût (€)"
                format="eur"
                limit={data.dailyLimitEur > 0 ? data.dailyLimitEur : undefined}
                limitLabel="Plafond / j"
                maxPoints={90}
              />
            </div>
          </section>

          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Coût par heure (€, Paris)
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Repère les rafales — survol pour tokens / appels.
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <TimeSeriesChart
                points={hourlyChartRows.map((r) => ({
                  label: r.label,
                  value: r.costEur,
                  secondary: r.calls,
                  secondaryLabel: "Appels",
                }))}
                valueLabel="Coût (€)"
                format="eur"
                maxPoints={72}
              />
            </div>
          </section>
        </>
      ) : null}

      {filters.tab === "hourly" ? (
        <div className="flex flex-col gap-8">
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Euros / heure
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Courbe = coût estimé · colonnes teintées si pic.
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <TimeSeriesChart
                points={hourlyChartRows.map((r) => ({
                  label: r.label,
                  value: r.costEur,
                  secondary: r.total,
                  secondaryLabel: "Tokens",
                }))}
                valueLabel="Coût (€)"
                format="eur"
                height={260}
                maxPoints={72}
              />
            </div>
          </section>
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Plans / heure
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Ligne = plafond plan/heure (bloque Sonnet).
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <TimeSeriesChart
                points={hourlyChartRows.map((r) => ({
                  label: r.label,
                  value: r.planCalls,
                  secondary: Math.round(r.costEur * 100) / 100,
                  secondaryLabel: "€ (approx)",
                }))}
                valueLabel="Plans"
                format="number"
                limit={planLimit > 0 ? planLimit : undefined}
                limitLabel="Plafond / h"
                height={220}
                maxPoints={72}
              />
            </div>
          </section>
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Détail par route et heure
            </h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2">Heure</th>
                    <th className="px-3 py-2">Route</th>
                    <th className="px-3 py-2">Appels</th>
                    <th className="px-3 py-2">Tokens</th>
                    <th className="px-3 py-2">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {[...mon.hourlyByRoute]
                    .reverse()
                    .slice(0, 100)
                    .map((r) => (
                      <tr key={`${r.hourKey}-${r.route}`} className="border-t border-line">
                        <td className="px-3 py-2 text-muted">{r.hourLabel}</td>
                        <td className="px-3 py-2 font-medium text-ink">{r.route}</td>
                        <td className="px-3 py-2 tabular-nums">{r.calls}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.total.toLocaleString("fr-FR")}
                        </td>
                        <td className="px-3 py-2 font-medium text-amber">
                          {formatEur(r.costEur)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {filters.tab === "routes" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Coût par route
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Hauteur = euros estimés.
            </p>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <CategoryChart
                mode="cost"
                points={data.tokensByRoute.map((r) => ({
                  label: r.route,
                  value: r.input + r.output,
                  costEur: r.costEur,
                }))}
              />
            </div>
          </section>
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Coût par type d&apos;échange
            </h3>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <CategoryChart
                mode="cost"
                points={data.exchangeKinds.map((k) => ({
                  label: k.kind,
                  value: k.tokens,
                  costEur: k.costEur,
                }))}
              />
            </div>
          </section>
          <section className="lg:col-span-2">
            <h3 className="font-display text-lg font-semibold text-ink">
              Séances par heure de la journée
            </h3>
            <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-4 sm:px-4">
              <HourHeatmap rows={data.sessionsByHour} />
            </div>
          </section>
        </div>
      ) : null}

      {filters.tab === "journal" ? (
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Journal des appels ({mon.apiJournal.length})
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            200 derniers appels de la période filtrée — sans SQL.
          </p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[800px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-3 py-2">Quand</th>
                  <th className="px-3 py-2">Personne</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Modèle</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Tokens · coût</th>
                </tr>
              </thead>
              <tbody>
                {mon.apiJournal.map((row, i) => (
                  <tr key={`${row.at}-${i}`} className="border-t border-line">
                    <td className="px-3 py-2 text-muted">{fmtWhen(row.at)}</td>
                    <td className="px-3 py-2 text-ink">
                      {row.userId ? (
                        <Link
                          href={`${userLinkPrefix}${row.userId}`}
                          className="text-teal hover:underline"
                        >
                          {row.userLabel}
                        </Link>
                      ) : (
                        row.userLabel
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.route}</td>
                    <td className="px-3 py-2 text-[11px] text-muted">
                      {row.model.replace("claude-", "")}
                    </td>
                    <td className="px-3 py-2 text-muted">{row.exchangeKind ?? "—"}</td>
                    <td className="px-3 py-2">
                      <TokensCost tokens={row.total} costEur={row.costEur} stack />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {filters.tab === "limits" ? (
        <>
          <p className="text-[13px] text-muted">
            Plafond configurable dans{" "}
            <a href="/admin/analytics?tab=pilotage" className="font-medium text-teal hover:underline">
              Monitoring → Pilotage
            </a>
            .
          </p>
          <MetricGrid
            items={[
              {
                label: "Plafond plan",
                value:
                  planLimit > 0 ? `${planLimit} / h` : "Désactivé",
                hint: "Réglages IA → Plafond plan",
              },
              {
                label: "Heures en dépassement",
                value: String(mon.planRateByHour.length),
                hint: "sur la période filtrée",
              },
            ]}
          />
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Dernière heure (glissante)
            </h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2">Personne</th>
                    <th className="px-3 py-2">Plans (heure courante)</th>
                    <th className="px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {mon.rateLimitNow.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-muted">
                        Aucun appel plan cette heure.
                      </td>
                    </tr>
                  ) : (
                    mon.rateLimitNow.map((r) => (
                      <tr key={r.userId ?? "null"} className="border-t border-line">
                        <td className="px-3 py-2 text-ink">{r.userLabel}</td>
                        <td className="px-3 py-2 tabular-nums font-medium">
                          {r.planCallsLastHour} /{" "}
                          {planLimit > 0 ? planLimit : "∞"}
                        </td>
                        <td className="px-3 py-2">
                          {planLimit <= 0 ? (
                            <span className="text-muted">—</span>
                          ) : r.overLimit ? (
                            <span className="text-amber">Bloqué</span>
                          ) : (
                            <span className="text-teal">OK</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3 className="font-display text-lg font-semibold text-ink">
              Historique des dépassements
            </h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2">Heure</th>
                    <th className="px-3 py-2">Personne</th>
                    <th className="px-3 py-2">Plans</th>
                  </tr>
                </thead>
                <tbody>
                  {mon.planRateByHour.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-muted">
                        Aucun dépassement sur la période.
                      </td>
                    </tr>
                  ) : (
                    mon.planRateByHour.map((r) => (
                      <tr
                        key={`${r.hourKey}-${r.userId ?? "null"}`}
                        className="border-t border-line"
                      >
                        <td className="px-3 py-2 text-muted">{r.hourLabel}</td>
                        <td className="px-3 py-2">{r.userLabel}</td>
                        <td className="px-3 py-2 font-medium text-amber">
                          {r.planCalls} appels
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
