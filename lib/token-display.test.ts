import { describe, expect, it } from "vitest";
import {
  formatTokenCount,
  formatTokensWithEur,
  formatSharedTokenLimitWithEur,
} from "./token-display";

describe("token-display", () => {
  it("formate tokens et euros", () => {
    expect(formatTokenCount(1200)).toMatch(/1[\s\u202f]?200 tok/);
    expect(formatTokensWithEur(1000, 0.42)).toMatch(/tok/);
    expect(formatTokensWithEur(1000, 0.42)).toMatch(/0,42/);
  });

  it("formate le plafond illimité", () => {
    expect(formatSharedTokenLimitWithEur(0)).toBe("Illimité");
  });
});
