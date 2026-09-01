"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
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

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get("userId");

  const [globalUsers, setGlobalUsers] = useState<UserTokenRow[]>([]);
  const [data, setData] = useState<AdminAnalyticsSnapshot | null>(null);
  const [error, setError] = useState<
    "auth" | "forbidden" | "fail" | "setup" | null
  >(null);
  const [loading, setLoading] = useState(true);

  const setUserFilter = useCallback(
    (userId: string | null) => {
      router.push(userId ? `/admin/analytics?userId=${userId}` : "/admin/analytics");
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/analytics")
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
    const path = selectedUserId
      ? `/api/admin/analytics?userId=${selectedUserId}`
      : "/api/admin/analytics";

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
  }, [selectedUserId]);

  const viewLabel =
    data?.viewUser?.name ||
    data?.viewUser?.email ||
    globalUsers.find((u) => u.userId === selectedUserId)?.name ||
    globalUsers.find((u) => u.userId === selectedUserId)?.email;

  return (
    <>
      <h2 className="font-display text-lg font-semibold text-ink">Tokens</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">
        Consommation IA globale ou par personne — tokens, séances, heures,
        abandon.
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
            selectedUserId={selectedUserId}
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
          <AnalyticsDashboard
            data={data}
            globalUsers={globalUsers}
            selectedUserId={selectedUserId}
            onSelectUser={setUserFilter}
          />
        </div>
      ) : null}
    </>
  );
}
