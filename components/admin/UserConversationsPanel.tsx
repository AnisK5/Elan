"use client";

import { useState } from "react";
import SessionTranscript from "@/components/admin/SessionTranscript";
import type { AdminSessionDetail } from "@/lib/admin-user-detail";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CONTEXT_LABELS: Record<string, string> = {
  desk: "Bureau",
  sortie: "Sortie",
  courses: "Courses",
  regulier: "Réguliers",
  deposer: "Déposer",
};

export default function UserConversationsPanel({
  sessions,
  defaultOpenAll = false,
}: {
  sessions: AdminSessionDetail[];
  defaultOpenAll?: boolean;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() =>
    defaultOpenAll ? new Set(sessions.map((s) => s.id)) : new Set(),
  );
  const [expandAll, setExpandAll] = useState(defaultOpenAll);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (expandAll) {
      setOpenIds(new Set());
      setExpandAll(false);
    } else {
      setOpenIds(new Set(sessions.map((s) => s.id)));
      setExpandAll(true);
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-[14px] text-muted">
        Aucune séance enregistrée — les conversations du chat accueil ne sont pas
        synchronisées (local uniquement). Seules les séances apparaissent ici.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {sessions.length} séance{sessions.length > 1 ? "s" : ""} — transcripts
          complets
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="shrink-0 text-[12px] font-medium text-teal hover:underline"
        >
          {expandAll ? "Tout replier" : "Tout déplier"}
        </button>
      </div>

      {sessions.map((s) => {
        const open = openIds.has(s.id);
        const ctx = s.context
          ? CONTEXT_LABELS[s.context] ?? s.context
          : "—";
        return (
          <article
            key={s.id}
            id={`session-${s.id}`}
            className="rounded-2xl border border-line bg-surface"
          >
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="text-[14px] font-medium text-ink">
                  {fmtWhen(s.date)}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {ctx} · {s.durationMin} min · {s.userTurns} échange
                  {s.userTurns > 1 ? "s" : ""} · {s.messageCount} messages
                </div>
                {!open && s.preview ? (
                  <p className="mt-1 line-clamp-2 text-[12px] italic text-faint">
                    « {s.preview} »
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted">
                {s.inputTokens + s.outputTokens > 0 ? (
                  <span>
                    {(s.inputTokens + s.outputTokens).toLocaleString("fr-FR")}{" "}
                    tok
                  </span>
                ) : null}
                <span>{open ? "▲" : "▼"}</span>
              </div>
            </button>
            {open ? (
              <div className="border-t border-line px-3 py-3">
                <SessionTranscript transcript={s.transcript} />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
