import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_HAIKU,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  DEFAULT_MODEL_PREFERENCE,
  isModelPreference,
  readModelPreference,
  resolveConversationModel,
  resolveModelPreference,
  resolveUtilityModel,
  writeModelPreference,
} from "./models";

describe("resolveConversationModel", () => {
  it("met le chat en Sonnet", () => {
    expect(resolveConversationModel("chat", "present")).toBe(CLAUDE_SONNET);
    expect(resolveConversationModel("chat", "light")).toBe(CLAUDE_SONNET);
  });

  it("met la séance en Sonnet par défaut, Opus si présent", () => {
    expect(resolveConversationModel("session", "light")).toBe(CLAUDE_SONNET);
    expect(resolveConversationModel("session", "present")).toBe(CLAUDE_OPUS);
  });
});

describe("resolveModelPreference", () => {
  it("lit le header", () => {
    const req = new Request("http://localhost/api/session", {
      headers: { "x-elan-model-pref": "light" },
    });
    expect(resolveModelPreference(req)).toBe("light");
  });

  it("replie sur light par défaut", () => {
    expect(resolveModelPreference()).toBe(DEFAULT_MODEL_PREFERENCE);
    expect(isModelPreference("nope")).toBe(false);
  });
});

describe("resolveUtilityModel", () => {
  it("utilise Haiku pour les tâches utilitaires", () => {
    expect(resolveUtilityModel()).toBe(CLAUDE_HAIKU);
  });
});

describe("readModelPreference", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migre v1 present (ancien défaut Opus) vers light", () => {
    store["elan.model-pref.v1"] = JSON.stringify({ pref: "present" });
    expect(readModelPreference()).toBe("light");
    expect(JSON.parse(store["elan.model-pref.v2"] ?? "")).toEqual({
      pref: "light",
      explicit: false,
    });
    expect(store["elan.model-pref.v1"]).toBeUndefined();
  });

  it("conserve v1 light comme choix explicite", () => {
    store["elan.model-pref.v1"] = JSON.stringify({ pref: "light" });
    expect(readModelPreference()).toBe("light");
    expect(JSON.parse(store["elan.model-pref.v2"] ?? "")).toEqual({
      pref: "light",
      explicit: true,
    });
  });

  it("garde Opus seulement si choisi explicitement en v2", () => {
    store["elan.model-pref.v2"] = JSON.stringify({
      pref: "present",
      explicit: true,
    });
    expect(readModelPreference()).toBe("present");
  });

  it("corrige v2 present sans explicit vers light", () => {
    store["elan.model-pref.v2"] = JSON.stringify({ pref: "present" });
    expect(readModelPreference()).toBe("light");
  });

  it("writeModelPreference marque le choix comme explicite", () => {
    writeModelPreference("present");
    expect(JSON.parse(store["elan.model-pref.v2"] ?? "")).toEqual({
      pref: "present",
      explicit: true,
    });
  });
});
