import { describe, expect, it } from "vitest";
import {
  emptyOverride,
  parseUserLimitOverride,
  parseUserLimitOverridesMap,
} from "./user-limits";

describe("user-limits", () => {
  it("parse un override valide", () => {
    expect(
      parseUserLimitOverride({ dailyTokens: 80_000, planPerHour: 20 }),
    ).toEqual({ dailyTokens: 80_000, planPerHour: 20 });
  });

  it("accepte inherit / null", () => {
    expect(
      parseUserLimitOverride({ dailyTokens: null, planPerHour: "inherit" }),
    ).toEqual({ dailyTokens: null, planPerHour: null });
  });

  it("accepte illimité tokens (0)", () => {
    expect(parseUserLimitOverride({ dailyTokens: 0 })).toEqual({
      dailyTokens: 0,
      planPerHour: null,
    });
  });

  it("filtre la map", () => {
    const map = parseUserLimitOverridesMap({
      u1: { dailyTokens: 50_000 },
      u2: { dailyTokens: null, planPerHour: null },
      bad: { dailyTokens: 3 },
    });
    expect(map.u1?.dailyTokens).toBe(50_000);
    expect(map.u2).toBeUndefined();
    expect(map.bad).toBeUndefined();
  });

  it("emptyOverride", () => {
    expect(emptyOverride()).toEqual({
      dailyTokens: null,
      planPerHour: null,
    });
  });
});
