import { afterEach, describe, expect, it } from "vitest";
import {
  ANTHROPIC_KEY_HEADER,
  anthropicFailMessage,
  classifyAnthropicError,
  encodeStreamError,
  looksLikeAnthropicKey,
  parseStreamError,
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

describe("erreurs Anthropic", () => {
  it("classe un solde à sec", () => {
    const raw =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';
    expect(classifyAnthropicError(new Error(raw))).toBe("credits");
    expect(anthropicFailMessage("credits")).toMatch(/pause technique/i);
    expect(anthropicFailMessage("quota")).toMatch(/beaucoup utilisé/i);
  });

  it("extrait le marqueur du flux", () => {
    const encoded = encodeStreamError(
      new Error("Your credit balance is too low to access the Anthropic API"),
    );
    const parsed = parseStreamError(`début\n\n${encoded}`);
    expect(parsed.kind).toBe("credits");
    expect(parsed.clean).toBe("début");
  });
});
