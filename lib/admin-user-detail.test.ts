import { describe, expect, it } from "vitest";
import { buildAdminUserDetail } from "./admin-user-detail";
import type { AdminUserRow } from "./admin-stats";

describe("buildAdminUserDetail", () => {
  const engagement: AdminUserRow = {
    id: "u1",
    email: "a@test.fr",
    name: "Alice",
    signedUp: "2026-08-01T10:00:00Z",
    lastSeen: "2026-08-23",
    daysActive30: 5,
    sessions: 2,
    sessionMinutes: 30,
    dwellMinutes: 45,
    streak: 2,
    longestStreak: 4,
    done30: 3,
    activated: true,
    notifyEnabled: true,
    openThreads: 2,
    lastSessionAt: "2026-08-22T09:00:00Z",
    feedbackCount: 1,
  };

  it("fusionne timeline et compte le backlog", () => {
    const detail = buildAdminUserDetail(
      "u1",
      "a@test.fr",
      "2026-08-01T10:00:00Z",
      {
        name: "Alice",
        defaultDurationMin: 15,
        notifyEnabled: true,
        notifyEmailEnabled: false,
        notifyTime: "09:00",
        notifyTimezone: "Europe/Paris",
        situation: "Voyage",
      },
      engagement,
      [
        {
          id: "t1",
          text: "Appeler le dentiste",
          kind: "action",
          status: "open",
          createdAt: "2026-08-20T10:00:00Z",
        },
        {
          id: "t2",
          text: "Relancer Paul",
          kind: "suivi",
          status: "done",
          createdAt: "2026-08-10T10:00:00Z",
          doneAt: "2026-08-22T10:00:00Z",
        },
      ],
      [
        {
          kind: "open",
          at: "2026-08-23T08:00:00Z",
          day: "2026-08-23",
        },
        {
          kind: "ritual",
          at: "2026-08-22T09:05:00Z",
          day: "2026-08-22",
        },
      ],
      [
        {
          id: "s1",
          date: "2026-08-22T09:10:00Z",
          durationMin: 15,
          context: "desk",
          transcript: [
            { role: "assistant", content: "Salut" },
            { role: "user", content: "On y va" },
          ],
        },
      ],
      [
        {
          id: "f1",
          message: "Manque un export",
          mood: "bof",
          source: "settings",
          createdAt: "2026-08-21T12:00:00Z",
        },
      ],
      [
        {
          id: "u1",
          at: "2026-08-22T09:12:00Z",
          route: "session",
          model: "claude-sonnet",
          inputTokens: 100,
          outputTokens: 50,
          exchangeKind: "turn",
          exchangeIndex: 1,
          sessionId: "s1",
          sessionContext: "desk",
          stopReason: null,
          latencyMs: 800,
        },
      ],
      true,
    );

    expect(detail.backlog.open).toBe(1);
    expect(detail.backlog.done).toBe(1);
    expect(detail.notifs.hasPushSub).toBe(true);
    expect(detail.sessions[0].messageCount).toBe(2);
    expect(detail.sessions[0].inputTokens).toBe(100);
    expect(detail.sessions[0].outputTokens).toBe(50);
    expect(detail.timeline.some((e) => e.label === "Rituel (notif)")).toBe(true);
    expect(detail.timeline.some((e) => e.kind === "feedback")).toBe(true);
    expect(detail.timeline[0].at >= detail.timeline[1].at).toBe(true);
    expect(detail.dayBands.length).toBeGreaterThan(0);
    expect(detail.activityDays).toHaveLength(90);
    expect(detail.totals.tokensTotal).toBe(150);
    expect(detail.totals.apiCalls).toBe(1);
  });
});
