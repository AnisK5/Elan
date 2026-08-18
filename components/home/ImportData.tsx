"use client";

import { useState } from "react";
import { importData } from "@/lib/store";

/** Import JSON depuis un autre appareil (fusion sans doublon). */

export default function ImportData() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  function run() {
    try {
      const data = JSON.parse(text);
      const { added } = importData(data);
      setMsg(
        added > 0
          ? `${added} truc${added > 1 ? "s" : ""} importé${added > 1 ? "s" : ""} ✓ — synchronisé sur ton compte.`
          : "Rien de nouveau à importer (déjà présent ?).",
      );
      setText("");
    } catch {
      setMsg("Format invalide — colle bien le JSON copié depuis la console.");
    }
  }

  if (!open) {
    return (
      <div className="text-center">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Importer d&apos;anciennes données
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">
        Importer d&apos;anciennes données
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Colle ici le JSON exporté depuis ton ancien appareil/adresse. Tes trucs
        seront fusionnés dans ton compte (sans doublon) et synchronisés.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder='{"threads":[...],"sessions":[...],"settings":...}'
        className="mt-2 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-teal"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={run}
          disabled={!text.trim()}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          Importer
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg("");
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
        >
          Fermer
        </button>
        {msg && <span className="text-xs text-teal-ink">{msg}</span>}
      </div>
    </div>
  );
}
