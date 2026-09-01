"use client";

import Link from "next/link";
import type { UserTokenRow } from "@/lib/admin-analytics";
import { formatEur } from "@/lib/anthropic-pricing";

export default function UserTokenTable({
  rows,
  selectedUserId,
  onSelectUser,
  analyticsBase = "/admin/analytics",
  userLinkPrefix = "/admin/users/",
}: {
  rows: UserTokenRow[];
  selectedUserId?: string | null;
  onSelectUser?: (userId: string | null) => void;
  analyticsBase?: string;
  userLinkPrefix?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-4 text-[13px] text-muted">
        Aucun utilisateur avec activité enregistrée.
      </p>
    );
  }

  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-faint">
          <tr>
            <th className="px-3 py-2 font-medium">Personne</th>
            <th className="px-3 py-2 font-medium">Tokens</th>
            <th className="px-3 py-2 font-medium">Coût est.</th>
            <th className="px-3 py-2 font-medium">Séances</th>
            <th className="px-3 py-2 font-medium">Appels</th>
            <th className="px-3 py-2 font-medium">Tok / séance</th>
            <th className="px-3 py-2 font-medium">Part</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const selected = selectedUserId === u.userId;
            const pct = Math.round((u.total / maxTotal) * 100);
            return (
              <tr
                key={u.userId}
                className={`border-t border-line ${selected ? "bg-teal-soft/30" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">
                    {u.name || u.email || "—"}
                  </div>
                  {u.name ? (
                    <div className="text-[11px] text-faint">{u.email}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink">
                  {u.total.toLocaleString("fr-FR")}
                  <div className="text-[10px] text-faint">
                    {u.input.toLocaleString("fr-FR")} in ·{" "}
                    {u.output.toLocaleString("fr-FR")} out
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums text-ink">
                  {formatEur(u.costEur)}
                </td>
                <td className="px-3 py-2 text-ink">{u.sessions}</td>
                <td className="px-3 py-2 text-ink">{u.apiCalls}</td>
                <td className="px-3 py-2 text-muted">
                  {u.avgTokensPerSession > 0
                    ? u.avgTokensPerSession.toLocaleString("fr-FR")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sink">
                      <div
                        className="h-full rounded-full bg-teal"
                        style={{ width: `${Math.max(pct, u.total > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted">
                      {pct}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    {onSelectUser ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectUser(selected ? null : u.userId)
                        }
                        className="text-[12px] font-medium text-teal hover:underline"
                      >
                        {selected ? "Tous" : "Filtrer"}
                      </button>
                    ) : (
                      <Link
                        href={`${analyticsBase}?userId=${u.userId}`}
                        className="text-[12px] font-medium text-teal hover:underline"
                      >
                        Filtrer
                      </Link>
                    )}
                    <Link
                      href={`${userLinkPrefix}${u.userId}`}
                      className="text-[12px] text-muted hover:text-ink hover:underline"
                    >
                      Fiche
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
