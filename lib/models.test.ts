import { describe, expect, it } from "vitest";
import {
  CLAUDE_HAIKU,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  DEFAULT_MODEL_PREFERENCE,
  isModelPreference,
  resolveConversationModel,
  resolveModelPreference,
  resolveUtilityModel,
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
