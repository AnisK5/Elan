import { describe, expect, it } from "vitest";
import { PLAN_CALLS_PER_HOUR } from "./plan-rate-limit";

describe("plan-rate-limit constants", () => {
  it("plafond à 10 appels plan / heure", () => {
    expect(PLAN_CALLS_PER_HOUR).toBe(10);
  });
});
