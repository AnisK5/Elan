import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_CALLS_PER_HOUR } from "./app-config";

describe("plan-rate-limit constants", () => {
  it("défaut documenté à 10", () => {
    expect(DEFAULT_PLAN_CALLS_PER_HOUR).toBe(10);
  });
});
