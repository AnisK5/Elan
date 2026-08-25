import { describe, expect, it } from "vitest";
import {
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  isModelPreference,
  resolveConversationModel,
  resolveModelPreference,
} from "./models";

describe("resolveConversationModel", () => {
  it("met le chat en Sonnet", () => {
    expect(resolveConversationModel("chat", "present")).toBe(CLAUDE_SONNET);
    expect(resolveConversationModel("chat", "light")).toBe(CLAUDE_SONNET);
  });

  it("met la séance en Opus par défaut, Sonnet si léger", () => {
    expect(resolveConversationModel("session", "present")).toBe(CLAUDE_OPUS);
    expect(resolveConversationModel("session", "light")).toBe(CLAUDE_SONNET);
  });
});

describe("resolveModelPreference", () => {
  it("lit le header", () => {
    const req = new Request("http://localhost/api/session", {
      headers: { "x-elan-model-pref": "light" },
    });
    expect(resolveModelPreference(req)).toBe("light");
  });

  it("replie sur present", () => {
    expect(resolveModelPreference()).toBe("present");
    expect(isModelPreference("nope")).toBe(false);
  });
});
