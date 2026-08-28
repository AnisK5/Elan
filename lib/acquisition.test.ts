import { describe, expect, it } from "vitest";
import {
  buildSignupMeta,
  captureAcquisitionFromUrl,
  formatAcquisitionLabel,
} from "./acquisition";

describe("acquisition", () => {
  it("capture les paramètres UTM", () => {
    const attr = captureAcquisitionFromUrl(
      "?utm_source=linkedin&utm_campaign=launch&ref=anis",
      "/",
    );
    expect(attr?.utmSource).toBe("linkedin");
    expect(attr?.utmCampaign).toBe("launch");
    expect(attr?.ref).toBe("anis");
  });

  it("construit la meta signup", () => {
    expect(
      buildSignupMeta(
        { ref: "demo", utmSource: "instagram" },
        "google",
      ),
    ).toEqual({
      authProvider: "google",
      ref: "demo",
      utmSource: "instagram",
    });
  });

  it("formate le libellé admin", () => {
    expect(
      formatAcquisitionLabel({
        survey: { channel: "word_of_mouth", answeredAt: "2026-08-27" },
      }),
    ).toBe("Bouche-à-oreille");
  });
});
