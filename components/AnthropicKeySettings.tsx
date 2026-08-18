"use client";

import { useEffect, useState } from "react";
import {
  looksLikeAnthropicKey,
  readUserAnthropicKey,
  writeUserAnthropicKey,
} from "@/lib/anthropic";

/** Clé Claude perso — reste sur cet appareil, jamais dans Supabase. */
export default function AnthropicKeySettings() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const k = readUserAnthropicKey();
    setHasKey(Boolean(k));
    setValue(k);
  }, []);

  function save() {
    setError("");
    const trimmed = value.trim();
    if (trimmed && !looksLikeAnthropicKey(trimmed)) {
      setError("Ça ne ressemble pas à une clé Anthropic (sk-ant-…).");
      return;
    }
    writeUserAnthropicKey(trimmed);
    setHasKey(Boolean(trimmed));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function clear() {
    setValue("");
    writeUserAnthropicKey("");
    setHasKey(false);
    setError("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">Clé Claude</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Optionnelle. Si tu en colles une, tes séances passent par ton compte
        Anthropic. Sinon, Élan utilise celle de l&apos;app. Elle reste sur cet
        appareil.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="sk-ant-…"
          className="min-w-[12rem] flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 font-mono text-sm"
        />
        <button
          onClick={save}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink"
        >
          Enregistrer
        </button>
        {hasKey && (
          <button
            onClick={clear}
            className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Utiliser celle de l&apos;app
          </button>
        )}
      </div>
      {saved && (
        <p className="mt-2 text-xs text-teal">
          {hasKey ? "Clé enregistrée sur cet appareil." : "On reprend celle de l'app."}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-amber">{error}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Console Anthropic → API keys.{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Ouvrir
        </a>
      </p>
    </div>
  );
}
