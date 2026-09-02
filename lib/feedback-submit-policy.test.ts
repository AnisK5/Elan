import { describe, expect, it } from "vitest";
import { shouldInstantSendThumb } from "./feedback-submit-policy";

describe("shouldInstantSendThumb", () => {
  it("envoie le pouce haut seul immédiatement", () => {
    expect(
      shouldInstantSendThumb({ rating: "up", message: "", instantUp: true }),
    ).toBe(true);
  });

  it("attend Envoyer si un message est en cours", () => {
    expect(
      shouldInstantSendThumb({
        rating: "up",
        message: "bug sur la séance",
        instantUp: true,
      }),
    ).toBe(false);
  });

  it("n'envoie jamais le pouce bas immédiatement", () => {
    expect(
      shouldInstantSendThumb({ rating: "down", message: "", instantUp: true }),
    ).toBe(false);
  });
});
