import { describe, expect, it } from "vitest";
import { PLAN_VERSION } from "./constants";
import {
  completeNextMoment,
  dayPlanMatches,
  dayPlanPileMatches,
  durationHintSet,
  isDayPlanStale,
  planDateKey,
  shouldAutoFetchPlan,
  snapDeskMins,
  skipMomentAt,
  toggleMomentDoneAt,
  mergeDayMoments,
  introFromMoments,
  todaySlot,
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
    const plan = upsertDayPlanSlot(
      null,
      pile,
      "desk",
      {
        why: "1) …",
        message: "quinze",
        pick: "15",
      },
      date,
    );
    expect(dayPlanPileMatches(plan, [t("1", "papa")], date)).toBe(true);
    expect(
      dayPlanMatches(
        plan,
        whySignature([t("1", "papa")], "À Vienne."),
        date,
      ),
    ).toBe(false);
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

describe("todaySlot + shouldAutoFetchPlan + isDayPlanStale", () => {
  it("relit le slot du jour même si la sig a bougé", () => {
    const date = planDateKey();
    const plan = upsertDayPlanSlot(
      null,
      "old-sig",
      "desk",
      { why: "w", message: "conseil", pick: "15" },
      date,
    );
    expect(todaySlot(plan, "desk", date)?.message).toBe("conseil");
    expect(todaySlot(plan, "sortie", date)).toBeNull();
  });

  it("auto-fetch seulement sans slot ou si forcé", () => {
    expect(
      shouldAutoFetchPlan({ hasTodaySlot: false, forceRefresh: false }),
    ).toBe(true);
    expect(
      shouldAutoFetchPlan({ hasTodaySlot: true, forceRefresh: false }),
    ).toBe(false);
    expect(
      shouldAutoFetchPlan({ hasTodaySlot: true, forceRefresh: true }),
    ).toBe(true);
    expect(
      shouldAutoFetchPlan({
        hasTodaySlot: true,
        forceRefresh: false,
        diagnosticOn: true,
      }),
    ).toBe(true);
  });

  it("détecte un plan stale après changement de pile", () => {
    const date = planDateKey();
    const plan = upsertDayPlanSlot(
      null,
      whySignature([t("1", "papa")], ""),
      "desk",
      { why: "w", message: "m", pick: "15" },
      date,
    );
    expect(isDayPlanStale(plan, [t("1", "papa")], "", date)).toBe(false);
    expect(
      isDayPlanStale(plan, [t("1", "papa"), t("2", "courses")], "", date),
    ).toBe(true);
  });
});

describe("snapDeskMins + durationHintSet + completeNextMoment", () => {
  it("accroche 25 min sur 30 (plus proche)", () => {
    expect(snapDeskMins(25)).toBe(30);
    expect(snapDeskMins(5)).toBe(5);
    expect(snapDeskMins(20)).toBe(15);
    expect(snapDeskMins(30)).toBe(30);
  });

  it("signale les durées y compris régulier timed, pas sortie", () => {
    expect(
      [...durationHintSet([
        { label: "A", mins: 25 },
        { label: "B", mins: 25, done: true },
        { label: "C", mins: 20, mode: "regulier" },
        { label: "Sortie", mode: "sortie" },
      ])].sort((a, b) => a - b),
    ).toEqual([15, 30]);
  });

  it("valide le prochain moment (préfère le mode de la séance)", () => {
    const next = completeNextMoment(
      [
        { label: "Relancer Laura", mins: 15, mode: "desk" },
        { label: "Loyer", mins: 15, mode: "regulier" },
      ],
      "regulier",
    );
    expect(next?.[0].done).toBeFalsy();
    expect(next?.[1].done).toBe(true);
  });

  it("valide le premier ouvert si pas de mode préféré", () => {
    const next = completeNextMoment([
      { label: "A", mins: 15 },
      { label: "B", mins: 15 },
    ]);
    expect(next?.[0].done).toBe(true);
    expect(next?.[1].done).toBeFalsy();
  });

  it("décline une piste sans la barrer comme faite", () => {
    const next = skipMomentAt(
      [
        { label: "Draps", mins: 15, mode: "regulier" },
        { label: "Autre", mins: 15 },
      ],
      0,
    );
    expect(next?.[0].skipped).toBe(true);
    expect(next?.[0].done).toBeFalsy();
    const after = completeNextMoment(next);
    expect(after?.[1].done).toBe(true);
  });

  it("coche et décoche un créneau à la main", () => {
    const done = toggleMomentDoneAt([{ label: "Draps", mins: 15 }], 0);
    expect(done?.[0].done).toBe(true);
    const undone = toggleMomentDoneAt(done, 0);
    expect(undone?.[0].done).toBeFalsy();
  });

  it("fusionne les pistes neuves sans redire les déclinées", () => {
    expect(
      mergeDayMoments(
        [{ label: "Draps", mins: 15, skipped: true }],
        [
          { label: "Draps", mins: 15 },
          { label: "Ranger le lit", mins: 15 },
        ],
      ),
    ).toEqual([
      { label: "Draps", mins: 15, skipped: true },
      { label: "Ranger le lit", mins: 15 },
    ]);
  });
});

describe("introFromMoments", () => {
  it("nomme uniquement les créneaux listés", () => {
    expect(
      introFromMoments([
        { label: "Billet Bangkok — choisir et réserver", mins: 50 },
        { label: "65€ agence + message à papa", mins: 30 },
      ]),
    ).toBe(
      "Aujourd'hui, je te propose 50 min pour « Billet Bangkok — choisir et réserver », puis 30 min pour « 65€ agence + message à papa ».",
    );
  });

  it("n'annonce pas un régulier absent des moments", () => {
    expect(introFromMoments([{ label: "Billet Bangkok", mins: 50 }])).not.toMatch(
      /linge/i,
    );
  });
});
