import { describe, expect, it } from "vitest";
import { buildAdminProduct } from "./admin-product";

describe("buildAdminProduct", () => {
  const now = new Date("2026-09-03T12:00:00Z");

  it("produit des séries continues et des KPIs", () => {
    const snap = buildAdminProduct(
      [
        {
          id: "u1",
          email: "a@test.fr",
          createdAt: "2026-08-20T10:00:00Z",
          name: "Alice",
        },
        {
          id: "u2",
          email: "b@test.fr",
          createdAt: "2026-09-01T10:00:00Z",
        },
      ],
      [
        {
          userId: "u1",
          kind: "open",
          at: "2026-09-02T09:00:00Z",
          day: "2026-09-02",
        },
        {
          userId: "u1",
          kind: "dwell",
          at: "2026-09-02T09:10:00Z",
          day: "2026-09-02",
          durationSec: 600,
        },
        {
          userId: "u1",
          kind: "session",
          at: "2026-09-02T09:15:00Z",
          day: "2026-09-02",
        },
        {
          userId: "u2",
          kind: "signup",
          at: "2026-09-01T10:00:00Z",
          day: "2026-09-01",
        },
      ],
      [
        {
          userId: "u1",
          date: "2026-09-02T09:15:00Z",
          durationMin: 12,
        },
      ],
      new Map([
        ["u1", { survey: { channel: "linkedin", answeredAt: "2026-08-20" } }],
        ["u2", null],
      ]),
      [
        {
          userId: "u1",
          at: "2026-09-02T10:00:00Z",
          route: "plan",
          model: "claude-sonnet-4-6",
          stopReason: null,
          latencyMs: 15_000,
        },
        {
          userId: "u1",
          at: "2026-09-02T10:05:00Z",
          route: "plan",
          model: "claude-sonnet-4-6",
          stopReason: "max_tokens",
          latencyMs: 2000,
        },
      ],
      [],
      new Map([
        ["u1", "a@test.fr"],
        ["u2", "b@test.fr"],
      ]),
      new Map([["u1", "Alice"]]),
      { days: 7, granularity: "day", tab: "overview" },
      10,
      now,
    );

    expect(snap.series.activeUsers).toHaveLength(7);
    expect(snap.series.sessionMinutes.some((p) => p.value === 12)).toBe(true);
    expect(snap.kpis.sessionsPeriod).toBe(1);
    expect(snap.kpis.highLatencyPeriod).toBeGreaterThanOrEqual(1);
    expect(snap.acquisition.some((a) => a.label === "LinkedIn")).toBe(true);
    expect(snap.funnel[0].value).toBe(2);
    expect(snap.frictionJournal.length).toBeGreaterThan(0);
  });
});
