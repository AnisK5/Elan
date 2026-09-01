import { describe, expect, it } from "vitest";
import { shouldNotifyAdminFeedback } from "./feedback-notify";

describe("shouldNotifyAdminFeedback", () => {
  it("ignore un simple pouce haut", () => {
    expect(
      shouldNotifyAdminFeedback({ message: "👍", mood: "up" }),
    ).toBe(false);
  });

  it("alerte sur un pouce bas", () => {
    expect(
      shouldNotifyAdminFeedback({ message: "👎", mood: "down" }),
    ).toBe(true);
  });

  it("alerte sur un vrai message", () => {
    expect(
      shouldNotifyAdminFeedback({
        message: "Le plan se contredit",
        mood: null,
      }),
    ).toBe(true);
  });
});
