import { describe, expect, it } from "vitest";
import { fillTokenDays, listUtcDays } from "./chart-series";

describe("chart-series", () => {
  it("liste N jours UTC continus", () => {
    const days = listUtcDays(3, new Date("2026-09-03T12:00:00Z"));
    expect(days).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("remplit les jours vides à zéro", () => {
    const filled = fillTokenDays(
      [
        {
          day: "2026-09-03",
          input: 10,
          output: 2,
          total: 12,
          costUsd: 0.1,
          costEur: 0.09,
        },
      ],
      3,
      new Date("2026-09-03T12:00:00Z"),
    );
    expect(filled.map((d) => d.day)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(filled[0].total).toBe(0);
    expect(filled[2].total).toBe(12);
  });
});
