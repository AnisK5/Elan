"use client";

import Link from "next/link";
import type { AdminAnalyticsSnapshot } from "@/lib/admin-analytics";
import {
  BarChart,
  HourHeatmap,
  MetricGrid,
} from "@/components/admin/AnalyticsCharts";

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
}: {
  data: AdminAnalyticsSnapshot;
  userLinkPrefix?: string;
  compact?: boolean;
}) {
  const t = data.totals;

  if (t.apiCalls === 0 && t.sessions === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-[14px] text-muted">
        Pas encore de données tokens — il faut d&apos;abord exécuter la migration{" "}
        <code className="text-ink">elan_api_usage</code> dans Supabase, puis laisser
        les gens utiliser l&apos;app connectés.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
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
          Tokens par jour
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
          À quelle heure ils font une séance
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
            Est-ce qu&apos;ils restent 5 min ou s&apos;installent vraiment ?
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
            Après combien d&apos;échanges ils partent
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

      {!compact && data.tokensByUser.length > 0 ? (
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Tokens par personne
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {data.tokensByUser.slice(0, 8).map((u) => (
              <Link
                key={u.userId}
                href={`${userLinkPrefix}${u.userId}`}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-teal/40"
              >
                <div>
                  <div className="font-medium text-ink">
                    {u.name || u.email}
                  </div>
                  <div className="text-[11px] text-faint">
                    {u.sessions} séance{u.sessions > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right text-[13px] tabular-nums text-ink">
                  {u.total.toLocaleString("fr-FR")} tok
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!compact ? (
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Séances récentes (détail)
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
