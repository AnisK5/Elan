"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { AiHealthSnapshot } from "@/lib/ai-health";
import {
  formatSharedTokenLimit,
  isUnlimitedSharedTokenLimit,
} from "@/lib/app-config";
import { formatQuotaUsage } from "@/lib/token-display";

async function adminGet(path: string): Promise<Response> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { headers });
}

const PING_LABELS: Record<string, string> = {
  credits: "crédits épuisés",
  auth: "clé refusée",
  rate: "limite de débit",
  quota: "plafond",
  no_key: "pas de clé",
  unknown: "erreur inconnue",
};

export default function AdminAiHealth() {
  const [health, setHealth] = useState<AiHealthSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminGet("/api/admin/ai-health");
      if (!res.ok) {
        setError("Diagnostic indisponible.");
        setHealth(null);
        return;
      }
      setHealth((await res.json()) as AiHealthSnapshot);
    } catch {
      setError("Diagnostic indisponible.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !health) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] text-muted">
        Diagnostic IA…
      </div>
    );
  }

  if (error && !health) return null;
  if (!health) return null;

  const ok = health.appPingOk && !health.quotaBlocked;
  const pingLabel = health.appPingOk
    ? "OK"
    : (PING_LABELS[health.appPingError ?? "unknown"] ??
      health.appPingError ??
      "échec");

  return (
    <div
      className={`rounded-2xl border p-4 text-[13px] leading-relaxed ${
        ok
          ? "border-teal/30 bg-teal-soft/40 text-teal-ink"
          : "border-amber/40 bg-amber-soft text-ink"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-medium">
          {ok ? "Clé de l'app OK" : "Problème IA détecté"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 text-[12px] font-medium text-teal hover:underline disabled:opacity-40"
        >
          {loading ? "…" : "Réessayer"}
        </button>
      </div>
      <p className="mt-1">{health.diagnosis}</p>
      <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
        <li>
          Clé Vercel :{" "}
          {health.anthropicKeyConfigured
            ? `présente${health.sharedKeySuffix ? ` (${health.sharedKeySuffix})` : ""}`
            : "absente"}
        </li>
        <li>Ping Anthropic : {pingLabel}</li>
        {!health.appPingOk && health.appPingError === "credits" ? (
          <li>
            <a
              href="https://console.anthropic.com/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal hover:underline"
            >
              Recharger sur Anthropic → Plans &amp; Billing
            </a>
          </li>
        ) : null}
        <li>
          Ta conso aujourd&apos;hui : {formatQuotaUsage(health.quotaUsed)}
          {health.quotaExempt ? " (exempt du plafond)" : ""}
        </li>
        {health.quotaExempt ? (
          <li>
            App (tous) aujourd&apos;hui :{" "}
            {formatQuotaUsage(health.quotaUsedGlobal)}
          </li>
        ) : null}
        <li>
          Plafond par personne :{" "}
          {isUnlimitedSharedTokenLimit(health.quotaLimit)
            ? "illimité"
            : formatSharedTokenLimit(health.quotaLimit)}
        </li>
      </ul>
    </div>
  );
}
