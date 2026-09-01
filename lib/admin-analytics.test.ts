import { describe, expect, it } from "vitest";
import { buildAdminAnalytics, countUserTurns } from "./admin-analytics";

describe("countUserTurns", () => {
  it("compte les messages utilisateur non vides", () => {
    expect(
      countUserTurns([
        { role: "assistant", content: "Salut" },
        { role: "user", content: "On y va" },
        { role: "user", content: "  " },
        { role: "user", content: "Ok" },
      ]),
    ).toBe(2);
  });
});

describe("buildAdminAnalytics", () => {
  it("agrège tokens, heures et abandon", () => {
    const snap = buildAdminAnalytics(
      [
        {
          userId: "u1",
          at: "2026-08-22T09:00:00Z",
          day: "2026-08-22",
          route: "session",
          model: "claude-opus-4-8",
          inputTokens: 1000,
          outputTokens: 200,
          sessionId: "s1",
          sessionContext: "desk",
          exchangeIndex: 1,
          exchangeKind: "user_turn",
        },
        {
          userId: "u1",
          at: "2026-08-22T09:05:00Z",
          day: "2026-08-22",
          route: "chat",
          model: "claude-sonnet-4-6",
          inputTokens: 300,
          outputTokens: 50,
          sessionId: null,
          sessionContext: null,
          exchangeIndex: 1,
          exchangeKind: "chat",
        },
      ],
      [
        {
          userId: "u1",
          id: "s1",
          date: "2026-08-22T09:00:00Z",
          durationMin: 12,
          context: "desk",
          transcript: [
            { role: "assistant", content: "Salut" },
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "user", content: "c" },
          ],
        },
      ],
      new Map([["u1", "a@test.fr"]]),
      new Map([["u1", "Alice"]]),
    );

    expect(snap.totals.totalTokens).toBe(1550);
    expect(snap.totals.costUsd).toBeGreaterThan(0);
    expect(snap.totals.costEur).toBeGreaterThan(0);
    expect(snap.totals.avgTurnsPerSession).toBe(2);
    expect(snap.tokensByUser[0].name).toBe("Alice");
    expect(snap.tokensByUser[0].apiCalls).toBe(2);
    expect(snap.tokensByUser[0].avgTokensPerSession).toBe(1550);
    expect(snap.dropoffTurns.find((d) => d.turns === 2)?.count).toBe(1);
    expect(snap.recentSessions[0].inputTokens).toBe(1000);
    expect(snap.recentSessions[0].costEur).toBeGreaterThan(0);
    expect(snap.exchangeKinds[0].costEur).toBeGreaterThan(0);
    expect(snap.contextBreakdown[0].costEur).toBeGreaterThan(0);
  });

  it("filtre par utilisateur et expose viewUser", () => {
    const snap = buildAdminAnalytics(
      [
        {
          userId: "u1",
          at: "2026-08-22T09:00:00Z",
          day: "2026-08-22",
          route: "session",
          model: "claude-opus-4-8",
          inputTokens: 1000,
          outputTokens: 200,
          sessionId: "s1",
          sessionContext: "desk",
          exchangeIndex: 1,
          exchangeKind: "user_turn",
        },
        {
          userId: "u2",
          at: "2026-08-22T10:00:00Z",
          day: "2026-08-22",
          route: "chat",
          model: "claude-sonnet-4-6",
          inputTokens: 500,
          outputTokens: 100,
          sessionId: null,
          sessionContext: null,
          exchangeIndex: 1,
          exchangeKind: "chat",
        },
      ],
      [],
      new Map([
        ["u1", "a@test.fr"],
        ["u2", "b@test.fr"],
      ]),
      new Map([["u1", "Alice"]]),
      "u1",
    );

    expect(snap.viewUser?.userId).toBe("u1");
    expect(snap.totals.totalTokens).toBe(1200);
    expect(snap.tokensByUser).toHaveLength(1);
    expect(snap.tokensByUser[0].userId).toBe("u1");
  });
});
