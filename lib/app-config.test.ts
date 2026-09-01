import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SHARED_DAILY_TOKEN_LIMIT,
  envSharedDailyTokenLimit,
  parseSharedTokenLimitInput,
  UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
} from "./app-config";

describe("app-config", () => {
  const prev = process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;

  afterEach(() => {
    if (prev === undefined) delete process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
    else process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = prev;
  });

  it("lit le plafond depuis l'env", () => {
    process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = "90000";
    expect(envSharedDailyTokenLimit()).toBe(90_000);
  });

  it("replie sur 120k par défaut", () => {
    delete process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
    expect(envSharedDailyTokenLimit()).toBe(DEFAULT_SHARED_DAILY_TOKEN_LIMIT);
  });

  it("accepte 0 en env pour illimité", () => {
    process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = "0";
    expect(envSharedDailyTokenLimit()).toBe(UNLIMITED_SHARED_DAILY_TOKEN_LIMIT);
  });

  it("valide les bornes du plafond", () => {
    expect(parseSharedTokenLimitInput(120_000)).toBe(120_000);
    expect(parseSharedTokenLimitInput(5_000)).toBeNull();
    expect(parseSharedTokenLimitInput(2_000_000)).toBeNull();
    expect(parseSharedTokenLimitInput(UNLIMITED_SHARED_DAILY_TOKEN_LIMIT)).toBe(
      UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
    );
    expect(parseSharedTokenLimitInput("unlimited")).toBe(
      UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
    );
  });
});
