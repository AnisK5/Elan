"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_PLAN_CALLS_PER_HOUR,
  MAX_PLAN_CALLS_PER_HOUR,
} from "@/lib/app-config";

const PRESETS = [
  { label: "5 · strict", value: 5 },
  { label: "10 · défaut", value: 10 },
  { label: "20 · confort", value: 20 },
  { label: "50 · large", value: 50 },
];

async function adminFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers });
}

export default function AdminPlanRateLimitSettings() {
  const [limit, setLimit] = useState(DEFAULT_PLAN_CALLS_PER_HOUR);
  const [source, setSource] = useState<"db" | "env">("env");
  const [envDefault, setEnvDefault] = useState(DEFAULT_PLAN_CALLS_PER_HOUR);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin/config")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Impossible de charger le plafond plan.");
          setLoading(false);
          return;
        }
        const j = (await res.json()) as {
          planCallsPerHour: number;
          planCallsPerHourSource: "db" | "env";
          planCallsPerHourEnvDefault: number;
        };
        setLimit(j.planCallsPerHour);
        setSource(j.planCallsPerHourSource);
        setEnvDefault(j.planCallsPerHourEnvDefault);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Impossible de charger le plafond plan.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextLimit: number) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    const res = await adminFetch("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify({ planCallsPerHour: nextLimit }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Enregistrement impossible — vérifie elan_app_config.");
      return;
    }
    const j = (await res.json()) as { planCallsPerHour: number };
    setLimit(j.planCallsPerHour);
    setSource("db");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface px-4 py-4">
        <p className="text-[13px] text-muted">Chargement du plafond plan…</p>
      </section>
    );
  }

  const enabled = limit > 0;

  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-4">
      <h2 className="font-display text-lg font-semibold text-ink">
        Plafond plan / heure
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Appels max à <code className="text-ink">/api/plan</code> par personne et
        par heure glissante — bloque avant Sonnet (anti-boucle). Actuel :{" "}
        <span className="font-medium text-ink">
          {enabled ? `${limit} / h` : "désactivé"}
        </span>
        {source === "env" ? " (défaut)" : " (enregistré)"}.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setLimit(0);
            void save(0);
          }}
          className={`w-full rounded-xl border px-3 py-2.5 text-[14px] font-medium transition disabled:opacity-40 ${
            !enabled
              ? "border-amber bg-amber-soft text-ink"
              : "border-line bg-paper text-muted hover:border-amber/40"
          }`}
        >
          Désactivé — pas de plafond (risqué)
        </button>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={busy}
              onClick={() => {
                setLimit(p.value);
                void save(p.value);
              }}
              className={`rounded-xl border px-3 py-2 text-[13px] transition disabled:opacity-40 ${
                limit === p.value
                  ? "border-teal bg-teal-soft/50 text-teal-ink"
                  : "border-line bg-paper text-muted hover:border-teal/30 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Personnalisé (1–{MAX_PLAN_CALLS_PER_HOUR})
          <input
            type="number"
            min={1}
            max={MAX_PLAN_CALLS_PER_HOUR}
            step={1}
            value={enabled ? limit : DEFAULT_PLAN_CALLS_PER_HOUR}
            disabled={!enabled}
            onChange={(e) =>
              setLimit(Number.parseInt(e.target.value, 10) || 1)
            }
            className="w-24 rounded-lg border border-line bg-paper px-2 py-1.5 text-[14px] tabular-nums text-ink disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          disabled={busy || !enabled}
          onClick={() => void save(limit)}
          className="rounded-lg bg-teal px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          {busy ? "…" : "Enregistrer"}
        </button>
        {saved ? (
          <span className="text-[12px] text-teal">Plafond mis à jour.</span>
        ) : null}
        {error ? (
          <span className="text-[12px] text-amber">{error}</span>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Repli env : {envDefault > 0 ? `${envDefault}/h` : "désactivé"} (
        <code className="text-muted">ELAN_PLAN_CALLS_PER_HOUR</code>). Modifier
        aussi dans{" "}
        <a href="/admin/settings" className="text-teal hover:underline">
          Réglages IA
        </a>
        .
      </p>
    </section>
  );
}
