import { describe, expect, it } from "vitest";
import { resolveAiPingStatus } from "./ai-ping-status";

describe("resolveAiPingStatus", () => {
  it("recommande le repli app si la clé perso est à sec", () => {
    const status = resolveAiPingStatus({
      userKeyActive: true,
      sharedKey: "sk-ant-shared",
      app: { ok: true },
      user: { ok: false, errorKind: "credits" },
    });
    expect(status.ok).toBe(true);
    expect(status.fallbackToApp).toBe(true);
  });

  it("signale une clé serveur absente", () => {
    const status = resolveAiPingStatus({
      userKeyActive: false,
      sharedKey: "",
      app: { ok: false, errorKind: "no_key" },
      user: null,
    });
    expect(status.errorKind).toBe("no_key");
  });

  it("conserve le ping app même si le quota est dépassé", () => {
    const status = resolveAiPingStatus({
      userKeyActive: false,
      sharedKey: "sk-ant-shared",
      quota: { used: 120_000, limit: 120_000 },
      app: { ok: true },
      user: null,
    });
    expect(status.ok).toBe(true);
    expect(status.app?.ok).toBe(true);
  });
});
