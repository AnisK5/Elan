import { afterEach, describe, expect, it } from "vitest";
import {
  ANTHROPIC_KEY_HEADER,
  looksLikeAnthropicKey,
  resolveAnthropicKey,
} from "./anthropic";

describe("looksLikeAnthropicKey", () => {
  it("accepte une clé Anthropic", () => {
    expect(
      looksLikeAnthropicKey("sk-ant-api03-" + "a".repeat(40)),
    ).toBe(true);
  });

  it("refuse le reste", () => {
    expect(looksLikeAnthropicKey("")).toBe(false);
    expect(looksLikeAnthropicKey("sk-openai-abc")).toBe(false);
    expect(looksLikeAnthropicKey("sk-ant-short")).toBe(false);
  });
});

describe("resolveAnthropicKey", () => {
  const prev = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  });

  it("préfère la clé du header", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-" + "b".repeat(40);
    const user = "sk-ant-user-" + "c".repeat(40);
    const req = new Request("http://localhost/api/plan", {
      headers: { [ANTHROPIC_KEY_HEADER]: user },
    });
    expect(resolveAnthropicKey(req)).toBe(user);
  });

  it("replie sur l'env si pas de header valide", () => {
    const env = "sk-ant-env-" + "d".repeat(40);
    process.env.ANTHROPIC_API_KEY = env;
    const req = new Request("http://localhost/api/plan");
    expect(resolveAnthropicKey(req)).toBe(env);
  });
});
