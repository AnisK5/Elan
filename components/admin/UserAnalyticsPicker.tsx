"use client";

import Link from "next/link";
import type { UserTokenRow } from "@/lib/admin-analytics";
import { formatTokensWithEur } from "@/lib/token-display";

export default function UserAnalyticsPicker({
  users,
  selectedUserId,
  onSelectUser,
  viewLabel,
}: {
  users: UserTokenRow[];
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  viewLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="analytics-user"
            className="text-[11px] font-medium uppercase tracking-wide text-faint"
          >
            Vue par personne
          </label>
          <select
            id="analytics-user"
            value={selectedUserId ?? ""}
            onChange={(e) => onSelectUser(e.target.value || null)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2 text-[14px] text-ink"
          >
            <option value="">Tous les utilisateurs</option>
            {users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name || u.email}
                {u.total > 0
                  ? ` — ${formatTokensWithEur(u.total, u.costEur)}`
                  : u.sessions > 0
                    ? ` — ${u.sessions} séance${u.sessions > 1 ? "s" : ""}`
                    : ""}
              </option>
            ))}
          </select>
        </div>
        {selectedUserId ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectUser(null)}
              className="rounded-lg border border-line px-3 py-2 text-[13px] text-muted transition hover:border-teal/30 hover:text-ink"
            >
              Voir tout
            </button>
            <Link
              href={`/admin/users/${selectedUserId}`}
              className="rounded-lg border border-teal/30 bg-teal-soft/40 px-3 py-2 text-[13px] font-medium text-teal-ink transition hover:border-teal"
            >
              Fiche complète →
            </Link>
          </div>
        ) : null}
      </div>
      {selectedUserId && viewLabel ? (
        <p className="mt-3 text-[13px] text-muted">
          Filtre actif : <span className="font-medium text-ink">{viewLabel}</span>
          {" — "}
          graphiques et totaux ci-dessous pour cette personne uniquement.
        </p>
      ) : null}
    </div>
  );
}
