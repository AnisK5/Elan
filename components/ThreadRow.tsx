"use client";

import { useState } from "react";
import type { Effort, Thread, ThreadKind } from "@/lib/types";

export default function ThreadRow({
  thread,
  patch,
  remove,
  showSnooze = false,
}: {
  thread: Thread;
  patch: (id: string, changes: Partial<Thread>) => void;
  remove: (id: string) => void;
  showSnooze?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(thread.text);
  const [note, setNote] = useState(thread.note ?? "");

  const dueValue = thread.due ? thread.due.slice(0, 10) : "";

  function reopen() {
    patch(thread.id, { status: "open", snoozedUntil: undefined });
  }
  function markDone() {
    const now = new Date().toISOString();
    patch(thread.id, {
      status: "done",
      touchedAt: now,
      doneAt: thread.doneAt ?? now,
    });
  }
  function snooze() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    patch(thread.id, { status: "snoozed", snoozedUntil: d.toISOString() });
  }
  function saveText() {
    const t = text.trim();
    if (t && t !== thread.text) patch(thread.id, { text: t });
  }
  function saveNote() {
    const n = note.trim();
    if (n !== (thread.note ?? "")) patch(thread.id, { note: n || undefined });
  }

  return (
    <div className="rounded-xl px-2 py-1.5 hover:bg-paper">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            thread.kind === "suivi"
              ? "bg-amber-soft text-amber"
              : "bg-teal-soft text-teal-ink"
          }`}
        >
          {thread.kind === "suivi" ? "SUIVI" : "ACTION"}
        </span>
        <span
          className={`flex-1 truncate text-sm ${
            thread.status === "done" ? "text-muted line-through" : "text-ink"
          }`}
        >
          {thread.text}
        </span>

        {thread.due && (
          <span className="shrink-0 text-[11px] text-muted">
            {formatDue(thread.due)}
          </span>
        )}
        {thread.effort && (
          <span className="shrink-0 rounded bg-sink px-1 text-[10px] font-medium text-muted">
            {thread.effort}
          </span>
        )}

        <button
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted transition hover:text-ink"
          aria-label="Modifier"
        >
          {editing ? "fermer" : "modifier"}
        </button>
        {showSnooze && thread.status !== "done" && (
          <button
            onClick={snooze}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
          >
            plus tard
          </button>
        )}
        {thread.status === "done" ? (
          <button
            onClick={reopen}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-teal transition hover:bg-teal-soft"
          >
            rouvrir
          </button>
        ) : (
          <button
            onClick={markDone}
            className="shrink-0 rounded-md bg-teal px-2 py-1 text-xs font-medium text-white transition hover:bg-teal-ink"
          >
            ✓ fait
          </button>
        )}
      </div>

      {thread.note && !editing && (
        <p className="mt-0.5 pl-1 text-[11px] italic leading-snug text-muted">
          {thread.note}
        </p>
      )}

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveText();
              }
            }}
            className="min-w-[140px] flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-teal"
          />
          <input
            type="date"
            value={dueValue}
            onChange={(e) =>
              patch(thread.id, {
                due: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
              })
            }
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-teal"
          />
          <Seg<Effort | "">
            value={thread.effort ?? ""}
            onChange={(v) =>
              patch(thread.id, { effort: v === "" ? undefined : (v as Effort) })
            }
            options={[
              { value: "", label: "—" },
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
            ]}
          />
          <Seg<ThreadKind>
            value={thread.kind}
            onChange={(v) => patch(thread.id, { kind: v })}
            options={[
              { value: "action", label: "à faire" },
              { value: "suivi", label: "à suivre" },
            ]}
          />
          <button
            onClick={() => remove(thread.id)}
            className="rounded-lg px-2 py-1 text-xs text-amber transition hover:bg-amber-soft"
          >
            supprimer
          </button>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveNote();
              }
            }}
            placeholder="contexte (enjeux, qui attend, une intention…)"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none placeholder:text-faint focus:border-teal"
          />
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({
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
          className={`rounded-[7px] px-2 py-0.5 text-xs font-medium transition ${
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

function formatDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const n = Math.round((dd.getTime() - today.getTime()) / 86_400_000);
  if (n < 0) return `−${-n}j`;
  if (n === 0) return "auj.";
  if (n === 1) return "demain";
  if (n <= 7) return `${n}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
