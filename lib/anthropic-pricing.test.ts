import { describe, expect, it } from "vitest";
import {
  estimateUsageCostEur,
  estimateUsageCostUsd,
  formatEur,
  resolveModelPricing,
} from "./anthropic-pricing";

describe("anthropic-pricing", () => {
  it("estime le coût par modèle", () => {
    const usd = estimateUsageCostUsd("claude-sonnet-4-6", 1_000_000, 100_000);
    expect(usd).toBeCloseTo(4.5, 5);
    const eur = estimateUsageCostEur("claude-haiku-4-5", 100_000, 10_000);
    expect(eur).toBeGreaterThan(0);
  });

  it("retombe sur Sonnet pour un modèle inconnu", () => {
    expect(resolveModelPricing("claude-unknown").inputPerMTokUsd).toBe(3);
  });

  it("formate en euros", () => {
    expect(formatEur(1.2)).toMatch(/1,20/);
  });
});
