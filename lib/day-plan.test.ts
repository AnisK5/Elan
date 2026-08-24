import { describe, expect, it } from "vitest";
import { PLAN_VERSION } from "./constants";
import {
  dayPlanMatches,
  dayPlanPileMatches,
  planDateKey,
  upsertDayPlanSlot,
  whySignature,
} from "./day-plan";
import type { Thread } from "./types";

const t = (id: string, text: string): Thread => ({
  id,
  text,
  kind: "action",
  status: "open",
  createdAt: "2026-01-01",
});

describe("whySignature", () => {
  it("ne change pas si on ne touche pas à la pile", () => {
    const a = whySignature([t("1", "papa")], "À Vienne.");
    const b = whySignature([t("1", "papa")], "À Vienne.");
    expect(a).toBe(b);
  });

  it("change si le cadre de vie change", () => {
    expect(whySignature([t("1", "papa")], "À Vienne.")).not.toBe(
      whySignature([t("1", "papa")], ""),
    );
  });
});

describe("dayPlanPileMatches", () => {
  it("accepte le plan cron avant hydratation du cadre de vie", () => {
    const date = planDateKey();
    const pile = whySignature([t("1", "papa")], "");
    const plan = upsertDayPlanSlot(null, pile, "desk", {
      why: "1) …",
      message: "quinze",
      pick: "15",
    }, date);
    expect(dayPlanPileMatches(plan, [t("1", "papa")], date)).toBe(true);
    expect(dayPlanMatches(plan, whySignature([t("1", "papa")], "À Vienne."), date)).toBe(false);
  });
});

describe("upsertDayPlanSlot", () => {
  it("garde le why desk quand on ajoute une sortie", () => {
    const date = planDateKey();
    const first = upsertDayPlanSlot(null, "sig", "desk", {
      why: "1) …",
      message: "quinze",
      pick: "15",
    });
    const next = upsertDayPlanSlot(first, "sig", "sortie", {
      why: "sortie",
      message: "dehors",
      pick: "sortie",
    });
    expect(next.slots.desk?.why).toBe("1) …");
    expect(next.slots.sortie?.pick).toBe("sortie");
    expect(dayPlanMatches(next, "sig", date, PLAN_VERSION)).toBe(true);
  });
});
