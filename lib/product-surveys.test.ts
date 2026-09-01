import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissWtpPrompt,
  formatWtpFeedback,
  isWtpDismissed,
  needsWtpSurvey,
  WTP_DISMISS_KEY,
} from "./product-surveys";

describe("product-surveys", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("propose le sondage WTP après 2 séances", () => {
    expect(
      needsWtpSurvey({
        sessionsCount: 2,
        modalShownThisVisit: false,
        acquisitionResolved: true,
      }),
    ).toBe(true);
    expect(
      needsWtpSurvey({
        sessionsCount: 1,
        modalShownThisVisit: false,
        acquisitionResolved: true,
      }),
    ).toBe(false);
  });

  it("respecte le dismiss", () => {
    dismissWtpPrompt(30);
    expect(isWtpDismissed()).toBe(true);
    expect(store[WTP_DISMISS_KEY]).toBeTruthy();
    expect(
      needsWtpSurvey({
        sessionsCount: 3,
        modalShownThisVisit: false,
        acquisitionResolved: true,
      }),
    ).toBe(false);
  });

  it("formate la réponse WTP", () => {
    expect(formatWtpFeedback("yes", "je teste")).toContain("5€/mois");
    expect(formatWtpFeedback("no")).toContain("Non");
  });
});
