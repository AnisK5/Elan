import { describe, expect, it } from "vitest";
import { buildUsageMonitor, parisHourKey } from "./admin-usage-monitor";
import type { RawApiUsageRow } from "./admin-analytics";

describe("buildUsageMonitor", () => {
  it("détecte une rafale plan > plafond", () => {
    const now = Date.now();
    const usage: RawApiUsageRow[] = Array.from({ length: 12 }, (_, i) => ({
      userId: "u1",
      at: new Date(now - i * 60_000).toISOString(),
      day: new Date().toISOString().slice(0, 10),
      route: "plan",
      model: "claude-sonnet-4-6",
      inputTokens: 10_000,
      outputTokens: 500,
      sessionId: null,
      sessionContext: null,
      exchangeIndex: null,
      exchangeKind: "plan",
    }));

    const mon = buildUsageMonitor(
      usage,
      new Map([["u1", "a@test.fr"]]),
      new Map([["u1", "Alice"]]),
    );

    expect(mon.anomalies.some((a) => a.kind === "plan_burst")).toBe(true);
    expect(mon.planRateByHour.length).toBeGreaterThan(0);
    expect(mon.rateLimitNow.some((r) => r.overLimit)).toBe(true);
  });

  it("agrège le journal récent", () => {
    const usage: RawApiUsageRow[] = [
      {
        userId: "u1",
        at: "2026-09-02T09:00:00Z",
        day: "2026-09-02",
        route: "chat",
        model: "claude-sonnet-4-6",
        inputTokens: 100,
        outputTokens: 20,
        sessionId: null,
        sessionContext: null,
        exchangeIndex: 1,
        exchangeKind: "chat",
      },
    ];
    const mon = buildUsageMonitor(usage, new Map(), new Map());
    expect(mon.apiJournal).toHaveLength(1);
    expect(mon.availableRoutes).toContain("chat");
  });
});

describe("parisHourKey", () => {
  it("formate une clé heure Paris", () => {
    expect(parisHourKey("2026-09-02T10:30:00Z")).toMatch(/T\d{2}$/);
  });
});
