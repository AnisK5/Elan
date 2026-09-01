import { describe, expect, it } from "vitest";
import {
  formatQuotaUsage,
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

  it("affiche 0 tok pour une conso nulle", () => {
    expect(formatQuotaUsage(0)).toBe("0 tok");
  });

  it("formate le plafond illimité", () => {
    expect(formatSharedTokenLimitWithEur(0)).toBe("Illimité");
  });
});
