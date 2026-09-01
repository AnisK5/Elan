"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_SHARED_DAILY_TOKEN_LIMIT,
  MAX_SHARED_DAILY_TOKEN_LIMIT,
  MIN_SHARED_DAILY_TOKEN_LIMIT,
} from "@/lib/app-config";

const PRESETS = [
  { label: "80k · léger", value: 80_000 },
  { label: "120k · défaut", value: 120_000 },
  { label: "200k · confort", value: 200_000 },
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

export default function AdminTokenLimitSettings() {
  const [limit, setLimit] = useState(DEFAULT_SHARED_DAILY_TOKEN_LIMIT);
  const [source, setSource] = useState<"db" | "env">("env");
  const [envDefault, setEnvDefault] = useState(DEFAULT_SHARED_DAILY_TOKEN_LIMIT);
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
          setError("Impossible de charger le plafond.");
          setLoading(false);
          return;
        }
        const j = (await res.json()) as {
          sharedDailyTokenLimit: number;
          source: "db" | "env";
          envDefault: number;
        };
        setLimit(j.sharedDailyTokenLimit);
        setSource(j.source);
        setEnvDefault(j.envDefault);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Impossible de charger le plafond.");
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
      body: JSON.stringify({ sharedDailyTokenLimit: nextLimit }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Enregistrement impossible — vérifie la table elan_app_config.");
      return;
    }
    const j = (await res.json()) as { sharedDailyTokenLimit: number };
    setLimit(j.sharedDailyTokenLimit);
    setSource("db");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-line bg-surface px-4 py-4">
        <p className="text-[13px] text-muted">Chargement du plafond tokens…</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface px-4 py-4">
      <h2 className="font-display text-lg font-semibold text-ink">
        Plafond IA partagée
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Tokens max / jour / personne sur ta clé Anthropic (hors clé perso dans
        Réglages, hors comptes admin). Actuel :{" "}
        <span className="font-medium text-ink">
          {limit.toLocaleString("fr-FR")} tok
        </span>
        {source === "env" ? " (valeur par défaut)" : " (enregistré)"}.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Personnalisé
          <input
            type="number"
            min={MIN_SHARED_DAILY_TOKEN_LIMIT}
            max={MAX_SHARED_DAILY_TOKEN_LIMIT}
            step={1000}
            value={limit}
            onChange={(e) => setLimit(Number.parseInt(e.target.value, 10) || 0)}
            className="w-36 rounded-lg border border-line bg-paper px-2 py-1.5 text-[14px] tabular-nums text-ink"
          />
        </label>
        <button
          type="button"
          disabled={busy}
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
        Repli env : {envDefault.toLocaleString("fr-FR")} tok (
        <code className="text-muted">ELAN_SHARED_DAILY_TOKEN_LIMIT</code>
        ). Migration SQL : table{" "}
        <code className="text-muted">elan_app_config</code>.
      </p>
    </section>
  );
}
