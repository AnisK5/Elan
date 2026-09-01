import { afterEach, describe, expect, it } from "vitest";
import {
  envSharedDailyTokenLimit,
  usesUserAnthropicKey,
} from "./api-budget";
import { ANTHROPIC_KEY_HEADER } from "./anthropic";

describe("api-budget", () => {
  const prev = process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;

  afterEach(() => {
    if (prev === undefined) delete process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
    else process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = prev;
  });

  it("détecte une clé utilisateur dans le header", () => {
    const key = "sk-ant-user-" + "a".repeat(40);
    const req = new Request("http://localhost/api/chat", {
      headers: { [ANTHROPIC_KEY_HEADER]: key },
    });
    expect(usesUserAnthropicKey(req)).toBe(true);
  });

  it("lit le plafond journalier depuis l'env", () => {
    process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = "12000";
    expect(envSharedDailyTokenLimit()).toBe(12000);
  });

  it("replie sur 120k par défaut", () => {
    delete process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
    expect(envSharedDailyTokenLimit()).toBe(120_000);
  });
});
