import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ACQUISITION_DISMISS_KEY,
  buildSignupMeta,
  captureAcquisitionFromUrl,
  dismissAcquisitionPrompt,
  formatAcquisitionLabel,
  isAcquisitionPromptDismissed,
  isAcquisitionResolved,
  mergeAcquisition,
  needsAcquisitionPrompt,
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

describe("mergeAcquisition", () => {
  it("garde la réponse locale si la DB est vide", () => {
    const local = {
      survey: { channel: "linkedin", answeredAt: "2026-08-28T10:00:00.000Z" },
    };
    expect(mergeAcquisition(local, undefined)).toEqual(local);
  });

  it("prend la réponse la plus récente", () => {
    const local = {
      survey: { channel: "google", answeredAt: "2026-08-28T12:00:00.000Z" },
    };
    const remote = {
      survey: { channel: "instagram", answeredAt: "2026-08-27T12:00:00.000Z" },
    };
    expect(mergeAcquisition(local, remote)?.survey?.channel).toBe("google");
  });
});

describe("needsAcquisitionPrompt", () => {
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

  it("ne redemande pas après réponse", () => {
    expect(
      needsAcquisitionPrompt({
        survey: { channel: "google", answeredAt: "2026-08-28" },
      }),
    ).toBe(false);
  });

  it("respecte le dismiss persistant", () => {
    dismissAcquisitionPrompt(90);
    expect(needsAcquisitionPrompt(undefined)).toBe(false);
    expect(isAcquisitionResolved(undefined)).toBe(true);
    expect(isAcquisitionPromptDismissed()).toBe(true);
    expect(store[ACQUISITION_DISMISS_KEY]).toBeTruthy();
  });
});
