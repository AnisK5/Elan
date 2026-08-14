import type { Thread } from "@/lib/types";

/** Fil conteneur — comme Courses, un seul élément pour tous les entretiens. */
export const ENTRETIENS_THREAD_TEXT = "Entretiens";

export interface EntretienItem {
  label: string;
  cadence: string;
  lastDone: string;
  note?: string;
}

const CONTAINER_TEXTS = new Set([
  ENTRETIENS_THREAD_TEXT.toLowerCase(),
  "courses",
]);

/** Ligne : libellé · ~cadence · YYYY-MM-DD · note optionnelle */
const LINE_RE =
  /^(.+?) · (~\d+(?:sem|mois|j)) · (\d{4}-\d{2}-\d{2})(?: · (.+))?$/;

export function isContainerThread(t: Thread): boolean {
  return CONTAINER_TEXTS.has(t.text.trim().toLowerCase());
}

export function findEntretiensThread(threads: Thread[]): Thread | undefined {
  return threads.find(
    (t) =>
      t.status === "open" &&
      t.text.trim().toLowerCase() === ENTRETIENS_THREAD_TEXT.toLowerCase(),
  );
}

export function parseEntretiens(note?: string): EntretienItem[] {
  if (!note?.trim()) return [];
  const items: EntretienItem[] = [];
  for (const line of note.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = LINE_RE.exec(trimmed);
    if (!m) continue;
    items.push({
      label: m[1].trim(),
      cadence: m[2].trim(),
      lastDone: m[3],
      note: m[4]?.trim() || undefined,
    });
  }
  return items;
}

export function serializeEntretiens(items: EntretienItem[]): string {
  return items
    .map((it) => {
      const base = `${it.label} · ${it.cadence} · ${it.lastDone}`;
      return it.note ? `${base} · ${it.note}` : base;
    })
    .join("\n");
}

export function cadenceToDays(cadence: string): number | null {
  const m = /^~(\d+)(sem|mois|j)$/.exec(cadence.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (m[2] === "j") return n;
  if (m[2] === "sem") return n * 7;
  return n * 30;
}

export function daysSince(isoDate: string, at = new Date()): number {
  const d = new Date(isoDate);
  d.setHours(0, 0, 0, 0);
  const t = new Date(at);
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((t.getTime() - d.getTime()) / 86_400_000));
}

export function isEntretienDue(item: EntretienItem, at = new Date()): boolean {
  const period = cadenceToDays(item.cadence);
  if (!period) return false;
  return daysSince(item.lastDone, at) >= period;
}

export function dueEntretiens(
  items: EntretienItem[],
  at = new Date(),
): EntretienItem[] {
  return items.filter((it) => isEntretienDue(it, at));
}

export function entretiensDueFromThreads(
  threads: Thread[],
  at = new Date(),
): EntretienItem[] {
  const container = findEntretiensThread(threads);
  if (!container) return [];
  return dueEntretiens(parseEntretiens(container.note), at);
}

export function hasEntretiensContainer(threads: Thread[]): boolean {
  return Boolean(findEntretiensThread(threads));
}

/** Compte le fil Entretiens une fois si au moins un entretien est mûr ; sinon 0. */
export function entretiensBacklogWeight(
  threads: Thread[],
  at = new Date(),
): number {
  return entretiensDueFromThreads(threads, at).length > 0 ? 1 : 0;
}

export function backlogCounts(threads: Thread[], at = new Date()) {
  const open = threads.filter((t) => t.status === "open");
  const entretiens = findEntretiensThread(open);
  const entretiensWeight = entretiensBacklogWeight(open, at);
  const regular = open.filter(
    (t) =>
      t.text.trim().toLowerCase() !== ENTRETIENS_THREAD_TEXT.toLowerCase(),
  );
  const total = regular.length + entretiensWeight;
  return {
    open: total,
    openActions:
      regular.filter((t) => t.kind !== "suivi").length + entretiensWeight,
    openSuivis: regular.filter((t) => t.kind === "suivi").length,
  };
}

export function renderEntretiensForPlan(
  threads: Thread[],
  at = new Date(),
): string {
  const container = findEntretiensThread(threads);
  if (!container) return "Aucun entretien retenu.";
  const items = parseEntretiens(container.note);
  if (items.length === 0) {
    return 'Fil "Entretiens" présent mais liste vide.';
  }
  const lines = items.map((it) => {
    const period = cadenceToDays(it.cadence);
    const since = daysSince(it.lastDone, at);
    const due = isEntretienDue(it, at);
    const ctx = it.note ? ` · ${it.note}` : "";
    const status = due
      ? ` · fenêtre ouverte (dernière fois il y a ${since}j, ~${it.cadence})`
      : period
        ? ` · ok pour l'instant (dernière fois il y a ${since}j / ~${it.cadence})`
        : ` · dernière fois il y a ${since}j`;
    return `- ${it.label}${status}${ctx}`;
  });
  const due = dueEntretiens(items, at);
  const header =
    due.length > 0
      ? `${items.length} entretien(s) retenu(s), ${due.length} fenêtre(s) ouverte(s) :`
      : `${items.length} entretien(s) retenu(s), rien de mûr pour l'instant :`;
  return `${header}\n${lines.join("\n")}`;
}

/** Threads ouverts pour les prompts — exclut Entretiens si rien de mûr. */
export function threadsForPlanPrompt(threads: Thread[], at = new Date()): Thread[] {
  const open = threads.filter((t) => t.status === "open");
  if (entretiensBacklogWeight(open, at) === 0) {
    return open.filter(
      (t) =>
        t.text.trim().toLowerCase() !== ENTRETIENS_THREAD_TEXT.toLowerCase(),
    );
  }
  return open;
}
