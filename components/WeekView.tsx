"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { useProjects, useThreads } from "@/lib/store";
import {
  DAY_KEYS,
  DAY_NAMES,
  PARTS,
  PART_NAMES,
  todayDayIdx,
  type WeekPlan,
} from "@/lib/week";

export default function WeekView({ onClose }: { onClose: () => void }) {
  const { projects, add, patch, remove, ready } = useProjects();
  const { threads } = useThreads();

  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  const active = projects.filter((p) => p.status === "active");

  async function generate() {
    setError("");
    setLoading(true);
    setPlan(null);
    try {
      const res = await fetch("/api/week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects, threads }),
      });
      if (!res.ok) {
        setError("Impossible de générer le plan pour l'instant.");
        return;
      }
      const j = (await res.json()) as WeekPlan;
      setPlan(j);
    } catch {
      setError("Connexion interrompue.");
    } finally {
      setLoading(false);
    }
  }

  function addProject() {
    const n = newName.trim();
    if (!n) return;
    add(n);
    setNewName("");
  }

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const idx = todayDayIdx();
  const remainingDays = DAY_KEYS.slice(idx);
  const slotsByKey = new Map((plan?.slots ?? []).map((s) => [s.slot, s]));

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-paper">
      <div className="mx-auto w-full max-w-xl px-5 pb-24">
        <header className="flex items-center justify-between py-6">
          <h1 className="font-display text-xl font-semibold text-ink">
            Ma semaine
          </h1>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:text-ink"
          >
            Fermer
          </button>
        </header>

        <p className="text-[13px] leading-relaxed text-muted">
          Dépose tes projets et ce à quoi ils servent. Élan te propose ensuite
          dans quel ordre les avancer cette semaine — et pourquoi. Rien à tenir :
          c&apos;est juste pour t&apos;aider à voir la forme des jours.
        </p>

        {/* ── Le plan de la semaine ─────────────────────────────── */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">La forme de ma semaine</h2>
            <button
              onClick={generate}
              disabled={loading || active.length === 0}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-ink disabled:opacity-40"
            >
              {loading ? "…" : plan ? "Régénérer" : "Proposer un ordre"}
            </button>
          </div>

          {active.length === 0 && (
            <p className="mt-2 text-sm text-faint">
              Ajoute au moins un projet en dessous pour commencer.
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-ink">
              {error}
            </div>
          )}

          {plan?.intro && (
            <div className="animate-rise mt-3 rounded-xl border border-teal-soft bg-teal-soft/50 px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal" />
                <span className="text-xs font-medium tracking-wide text-teal">
                  L&apos;idée de la semaine
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-teal-ink">
                {plan.intro}
              </p>
            </div>
          )}

          {plan && plan.slots.length > 0 && (
            <div className="mt-4 flex flex-col gap-2.5">
              {remainingDays.map((day) => {
                const dayHas = PARTS.some((p) => slotsByKey.has(`${day}-${p}`));
                return (
                  <div
                    key={day}
                    className={`rounded-xl border px-4 py-3 ${
                      day === DAY_KEYS[idx]
                        ? "border-teal/40 bg-surface"
                        : "border-line bg-surface"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-sm font-medium capitalize text-ink">
                        {DAY_NAMES[day]}
                      </span>
                      {day === DAY_KEYS[idx] && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-teal">
                          aujourd&apos;hui
                        </span>
                      )}
                    </div>
                    {dayHas ? (
                      <div className="flex flex-col gap-1.5">
                        {PARTS.map((part) => {
                          const s = slotsByKey.get(`${day}-${part}`);
                          if (!s) return null;
                          return (
                            <div key={part} className="flex gap-2.5">
                              <span className="mt-0.5 w-16 shrink-0 text-[11px] font-medium text-faint">
                                {PART_NAMES[part]}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="inline-block rounded-md bg-teal-soft px-2 py-0.5 text-[13px] font-medium text-teal-ink">
                                  {nameById.get(s.projectId) ?? "?"}
                                </span>
                                {s.rationale && (
                                  <p className="mt-0.5 text-[13px] leading-snug text-muted">
                                    {s.rationale}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[13px] text-faint">— libre</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Gestion des projets ───────────────────────────────── */}
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-medium text-muted">Mes projets</h2>

          <div className="mb-3 flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addProject();
                }
              }}
              placeholder="Nouveau projet — ex. Dvp de l'app"
              className="min-h-[40px] flex-1 bg-transparent px-2 text-[15px] text-ink outline-none placeholder:text-faint"
            />
            <button
              onClick={addProject}
              disabled={!newName.trim()}
              className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>

          {!ready ? null : projects.length === 0 ? (
            <p className="px-1 text-sm text-faint">
              Aucun projet pour l&apos;instant.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  others={projects.filter((o) => o.id !== p.id)}
                  patch={patch}
                  remove={remove}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  others,
  patch,
  remove,
}: {
  project: Project;
  others: Project[];
  patch: (id: string, changes: Partial<Project>) => void;
  remove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const deps = project.dependsOn ?? [];

  function toggleDep(id: string) {
    const next = deps.includes(id)
      ? deps.filter((d) => d !== id)
      : [...deps, id];
    patch(project.id, { dependsOn: next.length ? next : undefined });
  }

  const dueValue = project.due ? project.due.slice(0, 10) : "";

  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-3 ${
        project.status === "active" ? "border-line" : "border-dashed border-line opacity-70"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          value={project.name}
          onChange={(e) => patch(project.id, { name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none"
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-xs text-muted underline-offset-2 hover:underline"
        >
          {open ? "replier" : "détails"}
        </button>
      </div>

      {project.goal && !open && (
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          {project.goal}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-faint">
              À quoi ça sert / pourquoi ça compte
            </span>
            <textarea
              value={project.goal ?? ""}
              onChange={(e) =>
                patch(project.id, { goal: e.target.value || undefined })
              }
              rows={2}
              placeholder="ex. avoir un projet solide à montrer pour postuler"
              className="resize-none rounded-lg bg-sink/50 px-3 py-2 text-[14px] text-ink outline-none placeholder:text-faint"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-faint">
              Échéance globale (facultatif)
            </span>
            <input
              type="date"
              value={dueValue}
              onChange={(e) =>
                patch(project.id, {
                  due: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : undefined,
                })
              }
              className="w-fit rounded-lg bg-sink/50 px-3 py-2 text-[14px] text-ink outline-none"
            />
          </label>

          {others.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-faint">
                À faire avancer après (dépend de) :
              </span>
              <div className="flex flex-wrap gap-1.5">
                {others.map((o) => {
                  const on = deps.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggleDep(o.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-teal bg-teal-soft text-teal-ink"
                          : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {o.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1 text-xs">
            <button
              onClick={() =>
                patch(project.id, {
                  status: project.status === "active" ? "paused" : "active",
                })
              }
              className="text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {project.status === "active" ? "mettre en pause" : "réactiver"}
            </button>
            <button
              onClick={() => patch(project.id, { status: "done" })}
              className="text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              marquer terminé
            </button>
            <button
              onClick={() => remove(project.id)}
              className="ml-auto text-faint underline-offset-2 hover:text-amber hover:underline"
            >
              supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
