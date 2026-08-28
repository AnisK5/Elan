import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissPwaPrompt,
  hasMeaningfulEngagement,
  isPwaPromptDismissed,
  PWA_PROMPT_DISMISS_KEY,
  resolveEngagementPrompt,
} from "./engagement-prompts";

describe("hasMeaningfulEngagement", () => {
  it("exige une séance ou plusieurs trucs", () => {
    expect(hasMeaningfulEngagement(0, 0)).toBe(false);
    expect(hasMeaningfulEngagement(1, 0)).toBe(true);
    expect(hasMeaningfulEngagement(0, 2)).toBe(true);
    expect(hasMeaningfulEngagement(0, 1)).toBe(false);
  });
});

describe("resolveEngagementPrompt", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      navigator: {},
    });
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

  const base = {
    acquisitionResolved: true,
    modalShownThisVisit: false,
    sessionsCount: 1,
    threadsCount: 0,
    settings: { defaultDurationMin: 15 },
    pushReady: false,
    hasPushSub: null,
  };

  it("attend la fin du questionnaire acquisition", () => {
    expect(
      resolveEngagementPrompt({ ...base, acquisitionResolved: false }),
    ).toBeNull();
  });

  it("ne montre rien si une modale a déjà été vue cette visite", () => {
    expect(
      resolveEngagementPrompt({ ...base, modalShownThisVisit: true }),
    ).toBeNull();
  });

  it("propose la PWA avant les notifs", () => {
    expect(resolveEngagementPrompt(base)).toBe("pwa");
  });

  it("passe aux notifs quand la PWA est en place", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      navigator: { standalone: true },
    });
    expect(resolveEngagementPrompt(base)).toBe("notify");
  });

  it("respecte le dismiss PWA", () => {
    dismissPwaPrompt(14);
    expect(isPwaPromptDismissed()).toBe(true);
    expect(store[PWA_PROMPT_DISMISS_KEY]).toBeTruthy();
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      navigator: { standalone: true },
    });
    expect(resolveEngagementPrompt(base)).toBe("notify");
  });
});
