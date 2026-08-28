"use client";

import Link from "next/link";
import type { AdminAnalyticsSnapshot, UserTokenRow } from "@/lib/admin-analytics";
import {
  BarChart,
  HourHeatmap,
  MetricGrid,
} from "@/components/admin/AnalyticsCharts";
import UserTokenTable from "@/components/admin/UserTokenTable";

function fmtDay(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
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

export default function AnalyticsDashboard({
  data,
  userLinkPrefix = "/admin/users/",
  compact = false,
  globalUsers,
  selectedUserId,
  onSelectUser,
}: {
  data: AdminAnalyticsSnapshot;
  userLinkPrefix?: string;
  compact?: boolean;
  globalUsers?: UserTokenRow[];
  selectedUserId?: string | null;
  onSelectUser?: (userId: string | null) => void;
}) {
  const t = data.totals;
  const viewUser = data.viewUser;
  const viewLabel = viewUser?.name || viewUser?.email;
  const scopeHint = viewLabel ? ` — ${viewLabel}` : "";

  if (t.apiCalls === 0 && t.sessions === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-[14px] text-muted">
        Pas encore de données tokens{scopeHint ? ` pour ${viewLabel}` : ""} — il
        faut d&apos;abord exécuter la migration{" "}
        <code className="text-ink">elan_api_usage</code> dans Supabase, puis laisser
        les gens utiliser l&apos;app connectés.
      </p>
    );
  }

  const userRows = globalUsers ?? data.tokensByUser;

  return (
    <div className="flex flex-col gap-10">
      {viewUser ? (
        <div className="rounded-2xl border border-teal/30 bg-teal-soft/30 px-4 py-3">
          <p className="text-[14px] text-ink">
            Vue filtrée :{" "}
            <span className="font-semibold">
              {viewUser.name || viewUser.email}
            </span>
          </p>
          {compact ? (
            <Link
              href={`/admin/analytics?userId=${viewUser.userId}`}
              className="mt-2 inline-block text-[13px] font-medium text-teal hover:underline"
            >
              Ouvrir le dashboard tokens complet →
            </Link>
          ) : null}
        </div>
      ) : null}

      {!compact && userRows.length > 0 ? (
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Consommation par personne
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Tokens, séances et appels API — clique Filtrer pour voir les graphiques
            d&apos;une seule personne.
          </p>
          <div className="mt-3">
            <UserTokenTable
              rows={userRows}
              selectedUserId={selectedUserId}
              onSelectUser={onSelectUser}
              userLinkPrefix={userLinkPrefix}
            />
          </div>
        </section>
      ) : null}

      <MetricGrid
        items={[
          {
            label: "Tokens total",
            value: t.totalTokens.toLocaleString("fr-FR"),
            hint: `${t.inputTokens.toLocaleString("fr-FR")} in · ${t.outputTokens.toLocaleString("fr-FR")} out`,
          },
          {
            label: "Appels API",
            value: String(t.apiCalls),
          },
          {
            label: "Séances",
            value: String(t.sessions),
            hint: `~${t.avgSessionMin} min · ${t.avgTurnsPerSession} échanges`,
          },
          {
            label: "Tokens / séance",
            value: String(t.avgTokensPerSession),
          },
        ]}
      />

      <section>
        <h3 className="font-display text-lg font-semibold text-ink">
          Tokens par jour{scopeHint}
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          Consommation sur 30 jours — pour voir si ça accélère ou se stabilise.
        </p>
        <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
          <BarChart
            rows={data.tokensByDay.map((d) => ({
              label: fmtDay(d.day),
              total: d.total,
            }))}
            labelKey="label"
            valueKey="total"
          />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Où partent les tokens
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Séance, chat, plan du matin, greffier…
          </p>
          <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
            <BarChart
              rows={data.tokensByRoute.map((r) => ({
                label: r.route,
                total: r.input + r.output,
              }))}
              labelKey="label"
              valueKey="total"
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Type d&apos;échange
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Ouverture, tour utilisateur, clôture, chat…
          </p>
          <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
            <BarChart
              rows={data.exchangeKinds.map((k) => ({
                label: k.kind,
                total: k.tokens,
              }))}
              labelKey="label"
              valueKey="total"
            />
          </div>
        </section>
      </div>

      <section>
        <h3 className="font-display text-lg font-semibold text-ink">
          À quelle heure {viewUser ? "elle fait" : "ils font"} une séance
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          Heure de Paris — repère le rythme naturel (matin ? soir ?).
        </p>
        <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
          <HourHeatmap rows={data.sessionsByHour} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Durée des séances
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Est-ce qu&apos;{viewUser ? "elle reste" : "ils restent"} 5 min ou
            s&apos;installe vraiment ?
          </p>
          <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
            <BarChart
              rows={data.durationBuckets.map((b) => ({
                label: b.label,
                count: b.count,
              }))}
              labelKey="label"
              valueKey="count"
            />
          </div>
        </section>

        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Après combien d&apos;échanges {viewUser ? "elle part" : "ils partent"}
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Nombre de messages utilisateur avant la fin — friction ou flow ?
          </p>
          <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-4">
            <BarChart
              rows={data.dropoffTurns.map((d) => ({
                label: d.label,
                count: d.count,
              }))}
              labelKey="label"
              valueKey="count"
            />
          </div>
        </section>
      </div>

      <section>
        <h3 className="font-display text-lg font-semibold text-ink">
          Par contexte de séance
        </h3>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-2 font-medium">Contexte</th>
                <th className="px-3 py-2 font-medium">Séances</th>
                <th className="px-3 py-2 font-medium">Durée moy.</th>
                <th className="px-3 py-2 font-medium">Échanges moy.</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.contextBreakdown.map((c) => (
                <tr key={c.context} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{c.context}</td>
                  <td className="px-3 py-2 text-ink">{c.sessions}</td>
                  <td className="px-3 py-2 text-muted">{c.avgMin} min</td>
                  <td className="px-3 py-2 text-muted">{c.avgTurns}</td>
                  <td className="px-3 py-2 text-ink">
                    {c.tokens.toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!compact ? (
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Séances récentes (détail){scopeHint}
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Durée, échanges, tokens — pour se mettre dans une séance précise.
          </p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Quand</th>
                  <th className="px-3 py-2 font-medium">Contexte</th>
                  <th className="px-3 py-2 font-medium">Durée</th>
                  <th className="px-3 py-2 font-medium">Échanges</th>
                  <th className="px-3 py-2 font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSessions.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-3 py-2 text-muted">{fmtWhen(s.date)}</td>
                    <td className="px-3 py-2 text-ink">{s.context}</td>
                    <td className="px-3 py-2 text-ink">{s.durationMin} min</td>
                    <td className="px-3 py-2 text-ink">{s.userTurns}</td>
                    <td className="px-3 py-2 text-ink">
                      {(s.inputTokens + s.outputTokens).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
