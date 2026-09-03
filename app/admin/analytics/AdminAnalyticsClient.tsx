"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import UsageMonitorDashboard, {
  type MonitorFilters,
  type MonitorTab,
} from "@/components/admin/UsageMonitorDashboard";
import UserAnalyticsPicker from "@/components/admin/UserAnalyticsPicker";
import type { AdminAnalyticsSnapshot, UserTokenRow } from "@/lib/admin-analytics";
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

function parseTab(raw: string | null): MonitorTab {
  if (
    raw === "hourly" ||
    raw === "routes" ||
    raw === "journal" ||
    raw === "limits" ||
    raw === "pilotage" ||
    raw === "overview"
  ) {
    return raw;
  }
  return "pilotage";
}

function parseDays(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(1, n));
}

function buildQuery(filters: MonitorFilters): string {
  const p = new URLSearchParams();
  if (filters.userId) p.set("userId", filters.userId);
  if (filters.day) p.set("day", filters.day);
  else p.set("days", String(filters.days));
  if (filters.route !== "all") p.set("route", filters.route);
  if (filters.model !== "all") p.set("model", filters.model);
  if (filters.tab) p.set("tab", filters.tab);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo((): MonitorFilters => {
    const day = searchParams.get("day") ?? "";
    return {
      userId: searchParams.get("userId"),
      days: day ? 1 : parseDays(searchParams.get("days")),
      route: searchParams.get("route") ?? "all",
      model: searchParams.get("model") ?? "all",
      day,
      tab: parseTab(searchParams.get("tab")),
    };
  }, [searchParams]);

  const [globalUsers, setGlobalUsers] = useState<UserTokenRow[]>([]);
  const [data, setData] = useState<AdminAnalyticsSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);
  const [loading, setLoading] = useState(true);

  const patchFilters = useCallback(
    (patch: Partial<MonitorFilters>) => {
      const next = { ...filters, ...patch };
      if (patch.userId !== undefined) {
        next.userId = patch.userId;
      }
      router.push(`/admin/analytics${buildQuery(next)}`);
    },
    [filters, router],
  );

  const setUserFilter = useCallback(
    (userId: string | null) => patchFilters({ userId }),
    [patchFilters],
  );

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/analytics?days=90")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as AdminAnalyticsSnapshot;
          setGlobalUsers(json.tokensByUser);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = `/api/admin/analytics${buildQuery(filters)}`;

    adminGet(path)
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
        setData((await res.json()) as AdminAnalyticsSnapshot);
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

  const viewLabel =
    data?.viewUser?.name ||
    data?.viewUser?.email ||
    globalUsers.find((u) => u.userId === filters.userId)?.name ||
    globalUsers.find((u) => u.userId === filters.userId)?.email;

  return (
    <>
      <h2 className="font-display text-lg font-semibold text-ink">Monitoring IA</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        Pilotage des plafonds (global + par personne), coûts, appels par heure —
        le tout filtrable, sans SQL.
      </p>

      {error === "auth" && (
        <p className="mt-8 text-[15px] text-muted">Connecte-toi pour voir ces stats.</p>
      )}
      {error === "forbidden" && (
        <p className="mt-8 text-[15px] text-muted">Accès refusé.</p>
      )}
      {error === "setup" && (
        <p className="mt-8 text-[15px] text-muted">Configuration serveur incomplète.</p>
      )}
      {error === "fail" && (
        <p className="mt-8 text-[15px] text-amber">Impossible de charger les analytics.</p>
      )}

      {!error && globalUsers.length > 0 ? (
        <div className="mt-6">
          <UserAnalyticsPicker
            users={globalUsers}
            selectedUserId={filters.userId}
            onSelectUser={setUserFilter}
            viewLabel={viewLabel}
          />
        </div>
      ) : null}

      {!error && loading && (
        <p className="mt-8 text-sm text-faint">Chargement…</p>
      )}

      {!error && !loading && data ? (
        <div className="mt-8">
          <UsageMonitorDashboard
            data={data}
            filters={filters}
            onFiltersChange={patchFilters}
            globalUsers={globalUsers}
            onSelectUser={setUserFilter}
          />
        </div>
      ) : null}
    </>
  );
}
