import type { Thread } from "@/lib/types";

/** Fil conteneur — loyer, URSSAF, draps, tout ce qui revient. */
export const REGULIERS_THREAD_TEXT = "Réguliers";

export interface RegulierItem {
  label: string;
  cadence: string;
  lastDone: string;
  note?: string;
}

/** @deprecated alias */
export type EntretienItem = RegulierItem;

const REGULIERS_CONTAINER_NAMES = new Set([
  "réguliers",
  "reguliers",
  "rythmes",
  "entretiens",
]);

const CONTAINER_TEXTS = new Set([...REGULIERS_CONTAINER_NAMES, "courses"]);

/** Ligne : libellé · ~cadence · YYYY-MM-DD · note optionnelle */
const LINE_RE =
  /^(.+?) · (~\d+(?:sem|mois|j)) · (\d{4}-\d{2}-\d{2})(?: · (.+))?$/;

export function isReguliersContainerName(text: string): boolean {
  return REGULIERS_CONTAINER_NAMES.has(text.trim().toLowerCase());
}

export function isReguliersContainerThread(t: Thread): boolean {
  return isReguliersContainerName(t.text);
}

/** @deprecated alias */
export const isRythmesContainerThread = isReguliersContainerThread;

export function isContainerThread(t: Thread): boolean {
  return CONTAINER_TEXTS.has(t.text.trim().toLowerCase());
}

export function findReguliersThread(threads: Thread[]): Thread | undefined {
  return threads.find(
    (t) => t.status === "open" && isReguliersContainerThread(t),
  );
}

/** @deprecated aliases */
export const findRythmesThread = findReguliersThread;
export const findEntretiensThread = findReguliersThread;

export function parseReguliers(note?: string): RegulierItem[] {
  if (!note?.trim()) return [];
  const items: RegulierItem[] = [];
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

/** @deprecated alias */
export const parseEntretiens = parseReguliers;

export function serializeReguliers(items: RegulierItem[]): string {
  return items
    .map((it) => {
      const base = `${it.label} · ${it.cadence} · ${it.lastDone}`;
      return it.note ? `${base} · ${it.note}` : base;
    })
    .join("\n");
}

/** @deprecated alias */
export const serializeEntretiens = serializeReguliers;

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

export function isRegulierDue(item: RegulierItem, at = new Date()): boolean {
  const period = cadenceToDays(item.cadence);
  if (!period) return false;
  return daysSince(item.lastDone, at) >= period;
}

/** @deprecated alias */
export const isEntretienDue = isRegulierDue;

export function dueReguliers(
  items: RegulierItem[],
  at = new Date(),
): RegulierItem[] {
  return items.filter((it) => isRegulierDue(it, at));
}

/** @deprecated alias */
export const dueEntretiens = dueReguliers;

export function reguliersDueFromThreads(
  threads: Thread[],
  at = new Date(),
): RegulierItem[] {
  const container = findReguliersThread(threads);
  if (!container) return [];
  return dueReguliers(parseReguliers(container.note), at);
}

/** @deprecated aliases */
export const rythmesDueFromThreads = reguliersDueFromThreads;
export const entretiensDueFromThreads = reguliersDueFromThreads;

export function hasReguliersContainer(threads: Thread[]): boolean {
  return Boolean(findReguliersThread(threads));
}

/** @deprecated aliases */
export const hasRythmesContainer = hasReguliersContainer;
export const hasEntretiensContainer = hasReguliersContainer;

export function reguliersBacklogWeight(
  threads: Thread[],
  at = new Date(),
): number {
  return reguliersDueFromThreads(threads, at).length > 0 ? 1 : 0;
}

/** @deprecated aliases */
export const rythmesBacklogWeight = reguliersBacklogWeight;
export const entretiensBacklogWeight = reguliersBacklogWeight;

export function backlogCounts(threads: Thread[], at = new Date()) {
  const open = threads.filter((t) => t.status === "open");
  const reguliersWeight = reguliersBacklogWeight(open, at);
  const regular = open.filter((t) => !isReguliersContainerThread(t));
  const total = regular.length + reguliersWeight;
  return {
    open: total,
    openActions:
      regular.filter((t) => t.kind !== "suivi").length + reguliersWeight,
    openSuivis: regular.filter((t) => t.kind === "suivi").length,
  };
}

export function renderReguliersForPlan(
  threads: Thread[],
  at = new Date(),
): string {
  const container = findReguliersThread(threads);
  if (!container) return "Aucun régulier retenu.";
  const items = parseReguliers(container.note);
  if (items.length === 0) {
    return `Fil "${container.text}" présent mais liste vide.`;
  }
  const lines = items.map((it) => {
    const period = cadenceToDays(it.cadence);
    const since = daysSince(it.lastDone, at);
    const due = isRegulierDue(it, at);
    const ctx = it.note ? ` · ${it.note}` : "";
    const status = due
      ? ` · fenêtre ouverte (dernière fois il y a ${since}j, ~${it.cadence})`
      : period
        ? ` · ok pour l'instant (dernière fois il y a ${since}j / ~${it.cadence})`
        : ` · dernière fois il y a ${since}j`;
    return `- ${it.label}${status}${ctx}`;
  });
  const due = dueReguliers(items, at);
  const header =
    due.length > 0
      ? `${items.length} régulier(s) retenu(s), ${due.length} fenêtre(s) ouverte(s) :`
      : `${items.length} régulier(s) retenu(s), rien de mûr pour l'instant :`;
  return `${header}\n${lines.join("\n")}`;
}

/** @deprecated alias */
export const renderEntretiensForPlan = renderReguliersForPlan;

export function isReguliersListEmpty(threads: Thread[]): boolean {
  const container = findReguliersThread(threads);
  if (!container) return true;
  return parseReguliers(container.note).length === 0;
}

/** Threads ouverts pour les prompts bureau — exclut Réguliers si rien de mûr. */
export function threadsForPlanPrompt(threads: Thread[], at = new Date()): Thread[] {
  const open = threads.filter((t) => t.status === "open");
  if (reguliersBacklogWeight(open, at) === 0) {
    return open.filter((t) => !isReguliersContainerThread(t));
  }
  return open;
}

/** Bloc prompt quand la liste est vide — découverte douce, jamais imposée. */
export const REGULIERS_DISCOVERY_PROMPT = `LISTE VIDE — DÉCOUVERTE DOUCE :
- La personne a cliqué « Régulier » sans rien avoir retenu encore.
- Pose UNE question ouverte : est-ce qu'il y a des trucs qui reviennent et qu'elle oublie parfois ?
- Exemples possibles (2-3 max, jamais une checklist) : loyer ou prélèvement, URSSAF / déclaration, abonnement, entretien maison (draps, frigo), appeler quelqu'un régulièrement.
- Dis qu'on peut en retenir un ou deux ensemble en séance — seulement ce qu'ELLE choisit.
- IGNORE tous les autres trucs ouverts (mails, commissariat, échéances ponctuelles…).`;

/** Bloc prompt quand la liste a du contenu. */
export const REGULIERS_FOCUS_PROMPT = `RÈGLE ABSOLUE : tu ne parles QUE des réguliers ci-dessus (fil "Réguliers" ou noms legacy). IGNORE tous les autres trucs — échéances ponctuelles, commissariat, mails, relances, même urgents.`;
