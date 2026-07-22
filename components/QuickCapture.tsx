"use client";

import { useState } from "react";
import type { Effort, Thread, ThreadKind } from "@/lib/types";
import { tidyThread } from "@/lib/store";

function looksVerbose(t: string): boolean {
  return t.length > 55 || t.trim().split(/\s+/).length > 9;
}

export default function QuickCapture({
  onAdd,
  autoFocus = false,
}: {
  onAdd: (text: string, kind: ThreadKind, extra?: Partial<Thread>) => Thread;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<ThreadKind>("action");
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState("");
  const [effort, setEffort] = useState<Effort | "">("");
  const [justAdded, setJustAdded] = useState(false);

  function submit() {
    const t = text.trim();
    if (!t) return;
    const extra: Partial<Thread> = {};
    if (due) extra.due = new Date(due).toISOString();
    if (effort) extra.effort = effort;
    const created = onAdd(t, kind, extra);
    // Rangement en fond : ne bloque pas la capture, ne se déclenche que si c'est verbeux.
    if (created && looksVerbose(t)) void tidyThread(created.id, t);
    setText("");
    setDue("");
    setEffort("");
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-2 shadow-[0_2px_20px_-12px_rgba(38,35,29,0.25)]">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Vide ta tête…  (ex. relancer Paul pour le devis)"
          className="max-h-40 min-h-[46px] flex-1 resize-none rounded-xl bg-transparent px-3 py-3 text-[15px] leading-snug text-ink outline-none placeholder:text-faint"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="mb-0.5 shrink-0 rounded-xl bg-teal px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
        >
          Déposer
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-1">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "action", label: "À faire" },
            { value: "suivi", label: "À suivre" },
          ]}
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-ink"
        >
          {open ? "− détails" : "+ détails"}
        </button>
        {justAdded && (
          <span className="animate-rise text-xs font-medium text-teal">
            Déposé — tu peux l&apos;oublier ✓
          </span>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-1 pt-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            Échéance
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-teal"
            />
          </label>
          <div className="flex items-center gap-2 text-xs text-muted">
            Effort
            <Segmented
              value={effort || "M"}
              onChange={(v) => setEffort(v as Effort)}
              options={[
                { value: "S", label: "petit" },
                { value: "M", label: "moyen" },
                { value: "L", label: "gros" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-sink p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition ${
            value === o.value
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
