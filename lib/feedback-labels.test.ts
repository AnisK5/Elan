import { describe, expect, it } from "vitest";
import { formatFeedbackMood, formatFeedbackSource } from "./feedback-labels";

describe("feedback labels", () => {
  it("formate mood et source connus", () => {
    expect(formatFeedbackMood("bof")).toBe("Bof");
    expect(formatFeedbackSource("wrap_up")).toBe("Fin de séance");
  });

  it("retombe sur la valeur brute si inconnue", () => {
    expect(formatFeedbackMood("???")).toBe("???");
    expect(formatFeedbackSource("legacy")).toBe("legacy");
  });
});
