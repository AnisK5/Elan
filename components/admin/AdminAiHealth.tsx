"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { AiHealthSnapshot } from "@/lib/ai-health";

async function adminGet(path: string): Promise<Response> {
  const sb = getSupabase();
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { headers });
}

export default function AdminAiHealth() {
  const [health, setHealth] = useState<AiHealthSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminGet("/api/admin/ai-health")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Diagnostic indisponible.");
          return;
        }
        setHealth((await res.json()) as AiHealthSnapshot);
      })
      .catch(() => {
        if (!cancelled) setError("Diagnostic indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null;
  if (!health) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] text-muted">
        Diagnostic IA…
      </div>
    );
  }

  const ok = health.appPingOk && !health.quotaBlocked;

  return (
    <div
      className={`rounded-2xl border p-4 text-[13px] leading-relaxed ${
        ok
          ? "border-teal/30 bg-teal-soft/40 text-teal-ink"
          : "border-amber/40 bg-amber-soft text-ink"
      }`}
    >
      <p className="font-medium">
        {ok ? "Clé de l'app OK" : "Problème IA détecté"}
      </p>
      <p className="mt-1">{health.diagnosis}</p>
      <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
        <li>
          Clé Vercel : {health.anthropicKeyConfigured ? "présente" : "absente"}
        </li>
        <li>
          Ping Anthropic : {health.appPingOk ? "OK" : (health.appPingError ?? "échec")}
        </li>
        <li>
          Tokens aujourd&apos;hui :{" "}
          {health.quotaLimit === 0
            ? "illimité"
            : `${health.quotaUsed.toLocaleString("fr-FR")} / ${health.quotaLimit.toLocaleString("fr-FR")}`}
          {health.quotaExempt ? " (admin exempt)" : ""}
        </li>
      </ul>
    </div>
  );
}
