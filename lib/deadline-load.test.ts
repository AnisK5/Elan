import { describe, expect, it } from "vitest";
import {
  deadlineWindows,
  effortMins,
  offeredCapacityMins,
  renderDeadlineCharge,
} from "./deadline-load";
import type { Thread } from "./types";

function t(partial: Partial<Thread> & { id: string; text: string }): Thread {
  return {
    status: "open",
    kind: "action",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("effortMins", () => {
  it("mappe S/M/L", () => {
    expect(effortMins("S")).toBe(15);
    expect(effortMins("M")).toBe(30);
    expect(effortMins("L")).toBe(50);
    expect(effortMins(undefined)).toBe(25);
  });
});

describe("deadlineWindows", () => {
  it("ne garde que ≤ demain parmi les candidats", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const iso = (offset: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const { items, hardCount, totalMins } = deadlineWindows([
      t({ id: "1", text: "Dossier URSSAF", due: iso(0), effort: "M" }),
      t({ id: "2", text: "Impôts", due: iso(-2), effort: "S" }),
      t({ id: "3", text: "Plus tard", due: iso(5), effort: "L" }),
      t({ id: "4", text: "Demain doc", due: iso(1), effort: "S" }),
      t({
        id: "5",
        text: "Relancer Paul",
        due: iso(3),
        kind: "suivi",
        effort: "S",
      }),
    ]);

    expect(items.map((i) => i.id).sort()).toEqual(["1", "2", "4"]);
    expect(hardCount).toBe(2);
    expect(totalMins).toBe(30 + 15 + 15);
  });
});

describe("offeredCapacityMins", () => {
  it("somme desk + sortie", () => {
    expect(
      offeredCapacityMins([
        { label: "A", mins: 30 },
        { label: "B", mode: "sortie" },
      ]),
    ).toBe(60);
  });
});

describe("renderDeadlineCharge", () => {
  it("dit clairement s'il n'y a rien", () => {
    expect(renderDeadlineCharge([])).toMatch(/aucune échéance/);
  });
});
