import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_CALLS_PER_HOUR,
  DEFAULT_SHARED_DAILY_TOKEN_LIMIT,
  envPlanCallsPerHour,
  envSharedDailyTokenLimit,
  parsePlanCallsPerHourInput,
  parseSharedTokenLimitInput,
  UNLIMITED_SHARED_DAILY_TOKEN_LIMIT,
} from "./app-config";

describe("app-config", () => {
  const prevToken = process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
  const prevPlan = process.env.ELAN_PLAN_CALLS_PER_HOUR;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT;
    else process.env.ELAN_SHARED_DAILY_TOKEN_LIMIT = prevToken;
    if (prevPlan === undefined) delete process.env.ELAN_PLAN_CALLS_PER_HOUR;
    else process.env.ELAN_PLAN_CALLS_PER_HOUR = prevPlan;
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

  it("lit le plafond plan depuis l'env", () => {
    process.env.ELAN_PLAN_CALLS_PER_HOUR = "25";
    expect(envPlanCallsPerHour()).toBe(25);
  });

  it("replie plan sur 10 par défaut", () => {
    delete process.env.ELAN_PLAN_CALLS_PER_HOUR;
    expect(envPlanCallsPerHour()).toBe(DEFAULT_PLAN_CALLS_PER_HOUR);
  });

  it("accepte 0 plan = désactivé", () => {
    expect(parsePlanCallsPerHourInput(0)).toBe(0);
    expect(parsePlanCallsPerHourInput(10)).toBe(10);
    expect(parsePlanCallsPerHourInput(101)).toBeNull();
  });
});
