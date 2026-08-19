"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import type { UserStats } from "@/app/api/admin/users/route";

type SortKey = keyof UserStats;
type SortDir = "asc" | "desc";

function fmt(n: number | null | undefined, unit = ""): string {
  if (n === null || n === undefined) return "—";
  return `${n}${unit}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

function Badge({
  val,
  thresholds,
  labels,
}: {
  val: number;
  thresholds: [number, number];
  labels: [string, string, string]; // low, mid, high
}) {
  const [low, high] = thresholds;
  const [labelLow, labelMid, labelHigh] = labels;
  let cls = "px-1.5 py-0.5 rounded text-[11px] font-medium ";
  let label = labelMid;
  if (val <= low) {
    cls += "bg-red-100 text-red-700";
    label = labelLow;
  } else if (val >= high) {
    cls += "bg-emerald-100 text-emerald-700";
    label = labelHigh;
  } else {
    cls += "bg-amber-100 text-amber-700";
  }
  return <span className={cls}>{label}</span>;
}

function RecurrenceBadge({ spw }: { spw: number }) {
  return (
    <Badge
      val={spw}
      thresholds={[0.5, 4]}
      labels={["inactif", `${spw}×/sem`, "régulier"]}
    />
  );
}

function CompletionBadge({ pct }: { pct: number }) {
  return (
    <Badge
      val={pct}
      thresholds={[20, 60]}
      labels={[`${pct}%`, `${pct}%`, `${pct}%`]}
    />
  );
}

function th(label: string, key: SortKey, sort: SortKey, dir: SortDir, onSort: (k: SortKey) => void) {
  const active = sort === key;
  return (
    <th
      key={key}
      onClick={() => onSort(key)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800"
    >
      {label}
      {active && <span className="ml-1 text-gray-400">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [sort, setSort] = useState<SortKey>("lastSessionDate");
  const [dir, setDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    setFetching(true);
    setFetchError("");
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setFetchError("Accès refusé. Ton compte n'est pas administrateur.");
        return;
      }
      if (!res.ok) {
        setFetchError("Erreur serveur.");
        return;
      }
      const j = (await res.json()) as { users: UserStats[] };
      setUsers(j.users ?? []);
    } catch {
      setFetchError("Impossible de joindre le serveur.");
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void fetchUsers();
  }, [user, fetchUsers]);

  function handleSort(key: SortKey) {
    if (sort === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir("desc");
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.email.toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sort] ?? "";
    const vb = b[sort] ?? "";
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });

  // ── Aggregats globaux ──────────────────────────────────────────────────────
  const totalUsers = users.length;
  const activeUsers7 = users.filter((u) => u.sessionsLast7Days > 0).length;
  const activeUsers30 = users.filter((u) => u.sessionsLast30Days > 0).length;
  const totalSessions = users.reduce((a, u) => a + u.totalSessions, 0);
  const totalMinutesAll = users.reduce((a, u) => a + u.totalMinutes, 0);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <span className="h-4 w-4 animate-pulse rounded-full bg-teal-500" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center text-center">
        <p className="text-gray-500">Connecte-toi pour accéder à l&apos;admin.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">
              Administration — Élan
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Suivi des utilisateurs et de leur activité
            </p>
          </div>
          <button
            onClick={() => void fetchUsers()}
            disabled={fetching}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {fetching ? "Chargement…" : "Actualiser"}
          </button>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {/* KPIs globaux */}
        {users.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Utilisateurs", value: fmt(totalUsers) },
              { label: "Actifs 7j", value: fmt(activeUsers7) },
              { label: "Actifs 30j", value: fmt(activeUsers30) },
              { label: "Séances totales", value: fmt(totalSessions) },
              { label: "Temps total", value: fmtMinutes(totalMinutesAll) },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-0.5 text-xl font-semibold text-gray-900">
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Recherche */}
        <div className="mb-3">
          <input
            type="search"
            placeholder="Rechercher par email ou nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {fetching && users.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              Chargement des données…
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              {search ? "Aucun utilisateur trouvé." : "Aucun utilisateur."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {th("Utilisateur", "email", sort, dir, handleSort)}
                  {th("Inscription", "createdAt", sort, dir, handleSort)}
                  {th("Dernière séance", "lastSessionDate", sort, dir, handleSort)}
                  {th("Inactivité", "daysSinceLastSession", sort, dir, handleSort)}
                  {th("Séances", "totalSessions", sort, dir, handleSort)}
                  {th("7j", "sessionsLast7Days", sort, dir, handleSort)}
                  {th("30j", "sessionsLast30Days", sort, dir, handleSort)}
                  {th("Rythme", "sessionsPerWeek", sort, dir, handleSort)}
                  {th("Temps total", "totalMinutes", sort, dir, handleSort)}
                  {th("Moy./séance", "avgSessionMinutes", sort, dir, handleSort)}
                  {th("Trucs total", "threadsTotal", sort, dir, handleSort)}
                  {th("Ouverts", "threadsOpen", sort, dir, handleSort)}
                  {th("Faits", "threadsDone", sort, dir, handleSort)}
                  {th("Complétés", "completionRate", sort, dir, handleSort)}
                  {th("Notifs", "notifyEnabled", sort, dir, handleSort)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900">
                        {u.name ?? <span className="text-gray-400">—</span>}
                      </p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {fmtDate(u.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {fmtDate(u.lastSessionDate)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {u.daysSinceLastSession === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span
                          className={
                            u.daysSinceLastSession > 14
                              ? "font-medium text-red-600"
                              : u.daysSinceLastSession > 7
                                ? "text-amber-600"
                                : "text-gray-700"
                          }
                        >
                          {u.daysSinceLastSession}j
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium text-gray-700">
                      {fmt(u.totalSessions)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {fmt(u.sessionsLast7Days)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {fmt(u.sessionsLast30Days)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <RecurrenceBadge spw={u.sessionsPerWeek} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {fmtMinutes(u.totalMinutes)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {u.avgSessionMinutes > 0
                        ? fmtMinutes(u.avgSessionMinutes)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {fmt(u.threadsTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {fmt(u.threadsOpen)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">
                      {fmt(u.threadsDone)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {u.threadsTotal > 0 ? (
                        <CompletionBadge pct={u.completionRate} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {u.notifyEnabled && (
                          <span
                            title="Push actif"
                            className="rounded bg-teal-100 px-1 py-0.5 text-[10px] font-medium text-teal-700"
                          >
                            push
                          </span>
                        )}
                        {u.notifyEmailEnabled && (
                          <span
                            title="Email actif"
                            className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700"
                          >
                            mail
                          </span>
                        )}
                        {!u.notifyEnabled && !u.notifyEmailEnabled && (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-right text-xs text-gray-400">
          {sorted.length} utilisateur{sorted.length !== 1 ? "s" : ""} affiché
          {sorted.length !== 1 ? "s" : ""}
          {search ? ` sur ${totalUsers}` : ""}
        </p>
      </div>
    </main>
  );
}
