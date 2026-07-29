"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChatMessage,
  Effort,
  Project,
  ProjectStatus,
  Settings,
  SessionLog,
  Thread,
  ThreadKind,
} from "./types";
import { getSupabase } from "./supabase";

const THREADS_KEY = "elan.threads.v1";
const PROJECTS_KEY = "elan.projects.v1";
const SESSIONS_KEY = "elan.sessions.v1";
const SETTINGS_KEY = "elan.settings.v1";
const ACTIVE_KEY = "elan.active.v1";
const PLAN_KEY = "elan.plan.v1";

const SYNC_EVENT = "elan:sync";

// L'utilisateur connecté (défini par AuthProvider). Sans lui, pas de synchro.
let currentUserId: string | null = null;
export function setSyncUser(id: string | null) {
  currentUserId = id;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Écrit en local uniquement (utilisé par l'hydratation, pour ne pas re-pousser
// vers Supabase ce qu'on vient d'en tirer).
function writeLocalOnly<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key }));
}

// Écrit en local ET pousse vers Supabase (si connecté). Toutes les mutations
// passent par ici → la synchro est automatique, sans toucher aux composants.
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const oldRaw = window.localStorage.getItem(key);
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key }));
  const old = oldRaw ? safeJson(oldRaw) : null;
  void pushToSupabase(key, value, old);
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Mapping DB (snake_case) ↔ modèle (camelCase) ───────────────────
interface ThreadRow {
  id: string;
  text: string;
  kind: string;
  status: string;
  created_at: string;
  due: string | null;
  effort: string | null;
  energy: string | null;
  note: string | null;
  touched_at: string | null;
  snoozed_until: string | null;
  project_id: string | null;
}
interface SessionRow {
  id: string;
  date: string;
  duration_min: number;
  transcript: ChatMessage[];
}
interface SettingsRow {
  default_duration_min: number;
  name: string | null;
}

function threadToRow(t: Thread, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    text: t.text,
    kind: t.kind,
    status: t.status,
    created_at: t.createdAt,
    due: t.due ?? null,
    effort: t.effort ?? null,
    energy: t.energy ?? null,
    note: t.note ?? null,
    touched_at: t.touchedAt ?? null,
    snoozed_until: t.snoozedUntil ?? null,
    project_id: t.projectId ?? null,
  };
}
function rowToThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    text: r.text,
    kind: r.kind as ThreadKind,
    status: r.status as Thread["status"],
    createdAt: r.created_at,
    due: r.due ?? undefined,
    effort: (r.effort as Effort | null) ?? undefined,
    energy: (r.energy as Thread["energy"]) ?? undefined,
    note: r.note ?? undefined,
    touchedAt: r.touched_at ?? undefined,
    snoozedUntil: r.snoozed_until ?? undefined,
    projectId: r.project_id ?? undefined,
  };
}
interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  goal: string | null;
  depends_on: string[] | null;
  due: string | null;
}
function projectToRow(p: Project, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    status: p.status,
    created_at: p.createdAt,
    goal: p.goal ?? null,
    depends_on: p.dependsOn ?? null,
    due: p.due ?? null,
  };
}
function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    status: r.status as ProjectStatus,
    createdAt: r.created_at,
    goal: r.goal ?? undefined,
    dependsOn: r.depends_on ?? undefined,
    due: r.due ?? undefined,
  };
}
function sessionToRow(s: SessionLog, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    date: s.date,
    duration_min: s.durationMin,
    transcript: s.transcript,
  };
}
function rowToSession(r: SessionRow): SessionLog {
  return {
    id: r.id,
    date: r.date,
    durationMin: r.duration_min,
    transcript: r.transcript ?? [],
  };
}
function settingsToRow(s: Settings, userId: string) {
  return {
    user_id: userId,
    default_duration_min: s.defaultDurationMin,
    name: s.name ?? null,
    updated_at: new Date().toISOString(),
  };
}
function rowToSettings(r: SettingsRow): Settings {
  return { defaultDurationMin: r.default_duration_min, name: r.name ?? undefined };
}

// ── Poussée vers Supabase (upsert de tout le lot + suppression du diff) ──
async function pushToSupabase(key: string, value: unknown, old: unknown) {
  const sb = getSupabase();
  if (!sb || !currentUserId) return;
  const uid = currentUserId;
  try {
    if (key === THREADS_KEY) {
      const next = (value as Thread[]) ?? [];
      const prev = (old as Thread[]) ?? [];
      const nextIds = new Set(next.map((t) => t.id));
      const removed = prev.filter((t) => !nextIds.has(t.id)).map((t) => t.id);
      if (next.length)
        await sb
          .from("elan_threads")
          .upsert(next.map((t) => threadToRow(t, uid)));
      if (removed.length)
        await sb.from("elan_threads").delete().in("id", removed);
    } else if (key === SESSIONS_KEY) {
      const next = (value as SessionLog[]) ?? [];
      const prev = (old as SessionLog[]) ?? [];
      const nextIds = new Set(next.map((s) => s.id));
      const removed = prev.filter((s) => !nextIds.has(s.id)).map((s) => s.id);
      if (next.length)
        await sb
          .from("elan_sessions")
          .upsert(next.map((s) => sessionToRow(s, uid)));
      if (removed.length)
        await sb.from("elan_sessions").delete().in("id", removed);
    } else if (key === PROJECTS_KEY) {
      const next = (value as Project[]) ?? [];
      const prev = (old as Project[]) ?? [];
      const nextIds = new Set(next.map((p) => p.id));
      const removed = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
      if (next.length)
        await sb
          .from("elan_projects")
          .upsert(next.map((p) => projectToRow(p, uid)));
      if (removed.length)
        await sb.from("elan_projects").delete().in("id", removed);
    } else if (key === SETTINGS_KEY) {
      await sb.from("elan_settings").upsert(settingsToRow(value as Settings, uid));
    }
  } catch {
    // silencieux : la synchro ne doit jamais casser l'UI
  }
}

// ── Hydratation à la connexion (DB → local), avec migration du local si DB vide ──
export async function hydrateFromSupabase(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  currentUserId = userId;
  try {
    const [tRes, sRes, stRes] = await Promise.all([
      sb.from("elan_threads").select("*").eq("user_id", userId),
      sb
        .from("elan_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false }),
      sb.from("elan_settings").select("*").eq("user_id", userId).limit(1),
    ]);

    const dbThreads = ((tRes.data as ThreadRow[]) ?? []).map(rowToThread);
    const dbSessions = ((sRes.data as SessionRow[]) ?? []).map(rowToSession);
    const settingsRow = (stRes.data as SettingsRow[] | null)?.[0] ?? null;

    const localThreads = read<Thread[]>(THREADS_KEY, []);

    if (dbThreads.length === 0 && localThreads.length > 0) {
      // DB vide + données locales → on migre le local vers la DB (1er login).
      void pushToSupabase(THREADS_KEY, localThreads, []);
      const localSessions = read<SessionLog[]>(SESSIONS_KEY, []);
      if (localSessions.length)
        void pushToSupabase(SESSIONS_KEY, localSessions, []);
      const localSettings = read<Settings | null>(SETTINGS_KEY, null);
      if (localSettings) void pushToSupabase(SETTINGS_KEY, localSettings, null);
    } else {
      // Sinon la DB fait foi.
      writeLocalOnly(THREADS_KEY, dbThreads);
      writeLocalOnly(SESSIONS_KEY, dbSessions);
      if (settingsRow) writeLocalOnly(SETTINGS_KEY, rowToSettings(settingsRow));
    }
  } catch {
    // silencieux
  }

  // Projets : hydratés à part, dans leur propre try/catch — si la table
  // n'existe pas encore (schéma pas migré), ça ne doit PAS casser le reste.
  try {
    const pRes = await sb
      .from("elan_projects")
      .select("*")
      .eq("user_id", userId);
    if (!pRes.error) {
      const dbProjects = ((pRes.data as ProjectRow[]) ?? []).map(rowToProject);
      const localProjects = read<Project[]>(PROJECTS_KEY, []);
      if (dbProjects.length === 0 && localProjects.length > 0) {
        void pushToSupabase(PROJECTS_KEY, localProjects, []);
      } else {
        writeLocalOnly(PROJECTS_KEY, dbProjects);
      }
    }
  } catch {
    // silencieux
  }
}

// Efface les données locales (déconnexion), sans toucher à la DB.
export function clearLocalData(): void {
  currentUserId = null;
  if (typeof window === "undefined") return;
  for (const k of [THREADS_KEY, PROJECTS_KEY, SESSIONS_KEY, SETTINGS_KEY, ACTIVE_KEY, PLAN_KEY]) {
    window.localStorage.removeItem(k);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: k }));
  }
}

// Petit hook générique qui se resynchronise entre onglets / composants.
function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(read(key, fallback));
    setReady(true);

    const sync = () => setValue(read(key, fallback));
    const onCustom = (e: Event) => {
      if ((e as CustomEvent).detail === key) sync();
    };
    window.addEventListener(SYNC_EVENT, onCustom);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onCustom);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      write(key, next);
      setValue(next);
    },
    [key],
  );

  return { value, update, ready };
}

// --- Mises à jour appliquées par l'IA (réconciliation post-échange) ---

export type ThreadOp =
  | { op: "done"; id: string }
  | { op: "snooze"; id: string }
  | { op: "rename"; id: string; text: string }
  | { op: "note"; id: string; note: string }
  | { op: "set"; id: string; due?: string; effort?: Effort; kind?: ThreadKind }
  | {
      op: "add";
      text: string;
      kind: ThreadKind;
      due?: string;
      effort?: Effort;
      note?: string;
    };

function normalizeDue(due?: string): string | undefined {
  if (!due) return undefined;
  const d = new Date(due);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export async function tidyThread(id: string, text: string): Promise<void> {
  try {
    const res = await fetch("/api/tidy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const j = (await res.json()) as {
      title?: string | null;
      note?: string | null;
    };
    if (!j.title) return;

    const list = read<Thread[]>(THREADS_KEY, []);
    const cur = list.find((t) => t.id === id);
    if (!cur || cur.text !== text) return;
    if (j.title === text && !j.note) return;

    write(
      THREADS_KEY,
      list.map((t) =>
        t.id === id ? { ...t, text: j.title!, note: j.note || t.note } : t,
      ),
    );
  } catch {
    // silencieux
  }
}

// Import de données exportées d'un autre appareil/adresse (récupération).
// Fusionne par id (pas de doublon), préserve les ids d'origine, puis synchro.
export function importData(data: {
  threads?: Thread[];
  sessions?: SessionLog[];
  settings?: Settings | null;
}): { added: number } {
  let added = 0;
  if (Array.isArray(data.threads) && data.threads.length) {
    const cur = read<Thread[]>(THREADS_KEY, []);
    const ids = new Set(cur.map((t) => t.id));
    const incoming = data.threads.filter((t) => t && t.id && !ids.has(t.id));
    added = incoming.length;
    if (incoming.length) write(THREADS_KEY, [...incoming, ...cur]);
  }
  if (Array.isArray(data.sessions) && data.sessions.length) {
    const cur = read<SessionLog[]>(SESSIONS_KEY, []);
    const ids = new Set(cur.map((s) => s.id));
    const incoming = data.sessions.filter((s) => s && s.id && !ids.has(s.id));
    if (incoming.length)
      write(SESSIONS_KEY, [...incoming, ...cur].slice(0, 60));
  }
  if (data.settings) {
    write(SETTINGS_KEY, data.settings);
  }
  return { added };
}

export function snapshotThreads(): Thread[] {
  return read<Thread[]>(THREADS_KEY, []);
}

export function restoreThreads(list: Thread[]): void {
  write(THREADS_KEY, list);
}

export function applyThreadOps(ops: ThreadOp[]): void {
  if (!ops.length) return;
  const now = new Date().toISOString();
  let list = read<Thread[]>(THREADS_KEY, []);

  for (const op of ops) {
    if (op.op === "add") {
      const dup = list.some(
        (t) =>
          t.status === "open" &&
          t.text.trim().toLowerCase() === op.text.trim().toLowerCase(),
      );
      if (dup) continue;
      list = [
        {
          id: newId(),
          text: op.text.trim(),
          kind: op.kind,
          status: "open",
          createdAt: now,
          due: normalizeDue(op.due),
          effort: op.effort,
          note: op.note?.trim() || undefined,
        },
        ...list,
      ];
      continue;
    }
    list = list.map((t) => {
      if (t.id !== op.id) return t;
      switch (op.op) {
        case "done":
          return { ...t, status: "done", touchedAt: now };
        case "snooze":
          return { ...t, status: "snoozed", snoozedUntil: tomorrowISO() };
        case "rename":
          return { ...t, text: op.text.trim(), touchedAt: now };
        case "note":
          return { ...t, note: op.note.trim() || undefined, touchedAt: now };
        case "set":
          return {
            ...t,
            ...(op.due !== undefined ? { due: normalizeDue(op.due) } : {}),
            ...(op.effort ? { effort: op.effort } : {}),
            ...(op.kind ? { kind: op.kind } : {}),
            touchedAt: now,
          };
      }
    });
  }

  write(THREADS_KEY, list);
}

export function useThreads() {
  const { value, update, ready } = usePersisted<Thread[]>(THREADS_KEY, []);

  const add = useCallback(
    (text: string, kind: ThreadKind, extra?: Partial<Thread>) => {
      const t: Thread = {
        id: newId(),
        text: text.trim(),
        kind,
        status: "open",
        createdAt: new Date().toISOString(),
        ...extra,
      };
      update([t, ...value]);
      return t;
    },
    [value, update],
  );

  const patch = useCallback(
    (id: string, changes: Partial<Thread>) => {
      update(value.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    },
    [value, update],
  );

  const remove = useCallback(
    (id: string) => update(value.filter((t) => t.id !== id)),
    [value, update],
  );

  return { threads: value, add, patch, remove, ready };
}

export function useProjects() {
  const { value, update, ready } = usePersisted<Project[]>(PROJECTS_KEY, []);

  const add = useCallback(
    (name: string, extra?: Partial<Project>) => {
      const p: Project = {
        id: newId(),
        name: name.trim(),
        status: "active",
        createdAt: new Date().toISOString(),
        ...extra,
      };
      update([p, ...value]);
      return p;
    },
    [value, update],
  );

  const patch = useCallback(
    (id: string, changes: Partial<Project>) => {
      update(value.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    },
    [value, update],
  );

  const remove = useCallback(
    (id: string) =>
      update(
        value
          .filter((p) => p.id !== id)
          // on retire aussi la dépendance vers un projet supprimé
          .map((p) =>
            p.dependsOn?.includes(id)
              ? { ...p, dependsOn: p.dependsOn.filter((d) => d !== id) }
              : p,
          ),
      ),
    [value, update],
  );

  return { projects: value, add, patch, remove, ready };
}

export function useSessions() {
  const { value, update, ready } = usePersisted<SessionLog[]>(SESSIONS_KEY, []);
  const log = useCallback(
    (s: SessionLog) => update([s, ...value].slice(0, 60)),
    [value, update],
  );
  return { sessions: value, log, ready };
}

export function useSettings() {
  const { value, update, ready } = usePersisted<Settings>(SETTINGS_KEY, {
    defaultDurationMin: 15,
  });
  return { settings: value, update, ready };
}

// --- Séance active : reste LOCALE (éphémère, par appareil), pas de synchro ---

export interface ActiveSession {
  durationMin: number;
  elapsedSec: number;
  messages: ChatMessage[];
  startedAt: string;
}

export function readActiveSession(): ActiveSession | null {
  return read<ActiveSession | null>(ACTIVE_KEY, null);
}

export function writeActiveSession(s: ActiveSession) {
  writeLocalOnly(ACTIVE_KEY, s);
}

export function clearActiveSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: ACTIVE_KEY }));
}
