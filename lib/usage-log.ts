"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { dayKey, type UsageEvent, type UsageKind } from "./usage";

export const EVENTS_KEY = "elan.events.v1";
const SYNC_EVENT = "elan:sync";
const MAX_EVENTS = 400;

interface EventRow {
  id: string;
  kind: string;
  at: string;
  day: string;
  duration_sec: number | null;
  meta: Record<string, unknown> | null;
}

function eid(): string {
  return "e" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readEvents(): UsageEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as UsageEvent[]) : [];
  } catch {
    return [];
  }
}

function persist(events: UsageEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: EVENTS_KEY }));
}

function toRow(e: UsageEvent, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    kind: e.kind,
    at: e.at,
    day: e.day,
    duration_sec: e.durationSec ?? null,
    meta: e.meta ?? null,
  };
}

function rowToEvent(r: EventRow): UsageEvent {
  return {
    id: r.id,
    kind: r.kind as UsageKind,
    at: r.at,
    day: r.day,
    durationSec: r.duration_sec ?? undefined,
    meta: r.meta ?? undefined,
  };
}

async function resolveUserId(
  userId?: string | null,
): Promise<string | null> {
  if (userId) return userId;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function pushEvents(userId: string, events: UsageEvent[]) {
  const sb = getSupabase();
  if (!sb || !userId || events.length === 0) return;
  try {
    await sb.from("elan_events").upsert(events.map((e) => toRow(e, userId)));
  } catch {
    // silencieux : la table peut manquer tant que le SQL n'est pas passé
  }
}

export function logUsage(
  kind: UsageKind,
  opts?: {
    durationSec?: number;
    userId?: string | null;
    meta?: Record<string, unknown>;
  },
): void {
  if (typeof window === "undefined") return;
  const day = dayKey();
  const at = new Date().toISOString();
  const events = readEvents();

  if (kind === "open" && events.some((e) => e.kind === "open" && e.day === day)) {
    return;
  }

  if (kind === "signup" && events.some((e) => e.kind === "signup")) {
    return;
  }

  if (kind === "dwell") {
    const existing = events.find((e) => e.kind === "dwell" && e.day === day);
    if (existing) {
      const next: UsageEvent = {
        ...existing,
        at,
        durationSec: (existing.durationSec ?? 0) + (opts?.durationSec ?? 0),
      };
      persist(events.map((e) => (e.id === existing.id ? next : e)));
      void resolveUserId(opts?.userId).then((uid) => {
        if (uid) void pushEvents(uid, [next]);
      });
      return;
    }
  }

  const ev: UsageEvent = {
    id: eid(),
    kind,
    at,
    day,
    durationSec: opts?.durationSec,
    meta: opts?.meta,
  };
  persist([ev, ...events].slice(0, MAX_EVENTS));
  void resolveUserId(opts?.userId).then((uid) => {
    if (uid) void pushEvents(uid, [ev]);
  });
}

export async function hydrateUsageEvents(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const res = await sb
      .from("elan_events")
      .select("id, kind, at, day, duration_sec, meta")
      .eq("user_id", userId)
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(MAX_EVENTS);
    if (res.error) return;

    const remote = ((res.data as EventRow[]) ?? []).map(rowToEvent);
    const local = readEvents();
    if (remote.length === 0 && local.length > 0) {
      void pushEvents(userId, local);
      return;
    }

    const byId = new Map<string, UsageEvent>();
    for (const e of remote) byId.set(e.id, e);
    const extras: UsageEvent[] = [];
    for (const e of local) {
      const cur = byId.get(e.id);
      if (!cur) {
        byId.set(e.id, e);
        extras.push(e);
      } else if ((e.durationSec ?? 0) > (cur.durationSec ?? 0)) {
        byId.set(e.id, e);
        extras.push(e);
      }
    }
    persist(
      [...byId.values()]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, MAX_EVENTS),
    );
    if (extras.length) void pushEvents(userId, extras);
  } catch {
    // silencieux
  }
}

/** Temps passé onglet visible — pas un quota, juste du dwell. */
export function startDwellTracker(userId: string | null): () => void {
  if (typeof window === "undefined") return () => {};
  let last = Date.now();

  const flush = () => {
    const now = Date.now();
    const sec = Math.round((now - last) / 1000);
    last = now;
    if (sec > 0 && sec < 180) {
      logUsage("dwell", { durationSec: sec, userId });
    }
  };

  const id = window.setInterval(() => {
    if (document.visibilityState === "visible") flush();
    else last = Date.now();
  }, 60_000);

  const onVis = () => {
    if (document.visibilityState === "visible") last = Date.now();
    else flush();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    if (document.visibilityState === "visible") flush();
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
  };
}

export function useUsageEvents(): UsageEvent[] {
  const [events, setEvents] = useState<UsageEvent[]>([]);

  useEffect(() => {
    const sync = () => setEvents(readEvents());
    sync();
    const onCustom = (e: Event) => {
      if ((e as CustomEvent).detail === EVENTS_KEY) sync();
    };
    window.addEventListener(SYNC_EVENT, onCustom);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onCustom);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return events;
}

export { readEvents };
