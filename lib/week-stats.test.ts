import { describe, expect, it } from "vitest";
import type { Thread } from "./types";
import { doneCountsThisWeek, movedCountsThisWeek } from "./week-stats";

function thread(partial: Partial<Thread> & Pick<Thread, "id">): Thread {
  return {
    text: "test",
    kind: "action",
    status: "done",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...partial,
  };
}

describe("doneCountsThisWeek", () => {
  // Mercredi 12 août 2026, minuit locale
  const wednesday = new Date(2026, 7, 12);
  wednesday.setHours(0, 0, 0, 0);

  it("compte sur doneAt même si touchedAt a bougé aujourd'hui", () => {
    const yesterday = new Date(2026, 7, 11, 18, 0, 0);
    const today = new Date(2026, 7, 12, 10, 0, 0);
    const counts = doneCountsThisWeek(
      [
        thread({
          id: "a",
          doneAt: yesterday.toISOString(),
          touchedAt: today.toISOString(),
        }),
      ],
      wednesday.getTime(),
    );
    expect(counts.doneToday).toBe(0);
    expect(counts.days[1]).toBe(1); // mardi
  });

  it("répartit aujourd'hui et hier correctement", () => {
    const yesterday = new Date(2026, 7, 11, 12, 0, 0);
    const today = new Date(2026, 7, 12, 9, 0, 0);
    const counts = doneCountsThisWeek(
      [
        thread({ id: "a", doneAt: yesterday.toISOString() }),
        thread({ id: "b", doneAt: today.toISOString() }),
        thread({ id: "c", doneAt: today.toISOString() }),
      ],
      wednesday.getTime(),
    );
    expect(counts.doneToday).toBe(2);
    expect(counts.days[1]).toBe(1);
    expect(counts.doneWeek).toBe(3);
  });
});

describe("movedCountsThisWeek", () => {
  const wednesday = new Date(2026, 7, 12);
  wednesday.setHours(0, 0, 0, 0);

  it("compte un truc ouvert travaillé aujourd'hui", () => {
    const today = new Date(2026, 7, 12, 10, 0, 0);
    const counts = movedCountsThisWeek(
      [
        {
          id: "a",
          text: "Asie",
          kind: "action",
          status: "open",
          createdAt: "2026-08-01T10:00:00.000Z",
          touchedAt: today.toISOString(),
        },
      ],
      wednesday.getTime(),
    );
    expect(counts.movedToday).toBe(1);
    expect(counts.movedWeek).toBe(1);
  });
});
