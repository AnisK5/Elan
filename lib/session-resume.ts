/** Reprise de séance après un départ — fraîcheur, trou, « On reprend. » */

import type { ChatMessage } from "./types";
import { RESUME_MAX_AGE_MS } from "./constants";

export const RESUME_NUDGE_AFTER_MS = 2 * 60 * 1000;
export const RESUME_NUDGE_TEXT = "On reprend.";

export type ResumeSnapshot = {
  startedAt: string;
  updatedAt?: string;
  messages: ChatMessage[];
};

export function lastActivityMs(session: ResumeSnapshot): number {
  const stamps = [Date.parse(session.startedAt)];
  if (session.updatedAt) stamps.push(Date.parse(session.updatedAt));
  for (const m of session.messages) {
    if (m.at) stamps.push(Date.parse(m.at));
  }
  const valid = stamps.filter((n) => Number.isFinite(n));
  return valid.length > 0 ? Math.max(...valid) : 0;
}

/** Moins de 2 h depuis la dernière activité dans la séance. */
export function isFreshActiveSession(
  session: ResumeSnapshot | null | undefined,
  now = Date.now(),
): session is ResumeSnapshot {
  if (!session) return false;
  const last = lastActivityMs(session);
  if (!last) return false;
  return now - last < RESUME_MAX_AGE_MS;
}

export function shouldNudgeResume(
  session: ResumeSnapshot,
  now = Date.now(),
): boolean {
  const msgs = session.messages.filter((m) => m.content.trim());
  if (msgs.length === 0) return false;
  const last = msgs[msgs.length - 1];
  if (last.role !== "assistant") return false;
  if (last.content.trim() === RESUME_NUDGE_TEXT) return false;
  return now - lastActivityMs(session) >= RESUME_NUDGE_AFTER_MS;
}

export function withResumeNudge(
  messages: ChatMessage[],
  now = new Date(),
): ChatMessage[] {
  const trimmed = messages.filter((m) => m.content.trim());
  if (trimmed.length === 0) return messages;
  const last = trimmed[trimmed.length - 1];
  if (last.role !== "assistant") return messages;
  if (last.content.trim() === RESUME_NUDGE_TEXT) return messages;
  return [
    ...messages,
    {
      role: "assistant",
      content: RESUME_NUDGE_TEXT,
      at: now.toISOString(),
    },
  ];
}
