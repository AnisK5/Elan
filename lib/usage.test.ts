import { describe, expect, it } from "vitest";
import type { SessionLog, Thread } from "./types";
import {
  computeUsageWeek,
  consecutivePassageDays,
  dayKey,
} from "./usage";

describe("computeUsageWeek", () => {
  const wednesday = new Date(2026, 7, 12);
  wednesday.setHours(0, 0, 0, 0);

  it("compte un passage pour une info, pas pour une ouverture", () => {
    const week = computeUsageWeek(
      [
        { id: "1", kind: "open", at: "2026-08-12T08:00:00", day: "2026-08-12" },
        { id: "2", kind: "aside", at: "2026-08-12T08:01:00", day: "2026-08-12" },
      ],
      [],
      [],
      wednesday.getTime(),
    );
    expect(week.passages).toBe(1);
    expect(week.days[2]).toBe(true);
  });

  it("reprend les séances déjà loguées sans événement", () => {
    const sessions: SessionLog[] = [
      { id: "s", date: "2026-08-11T10:00:00", durationMin: 15, transcript: [] },
    ];
    const week = computeUsageWeek([], sessions, [], wednesday.getTime());
    expect(week.passages).toBe(1);
    expect(week.sessions).toBe(1);
    expect(week.minutes).toBe(15);
    expect(week.days[1]).toBe(true);
  });
});

describe("consecutivePassageDays", () => {
  it("s'arrête au premier trou", () => {
    const today = new Date(2026, 7, 12, 12);
    expect(
      consecutivePassageDays(
        [
          { id: "a", kind: "aside", at: "", day: dayKey(today) },
          { id: "b", kind: "session", at: "", day: "2026-08-11" },
        ],
        [],
        today,
      ),
    ).toBe(2);
  });
});

describe("done in usage week", () => {
  it("garde les réglés à part", () => {
    const wednesday = new Date(2026, 7, 12);
    wednesday.setHours(0, 0, 0, 0);
    const threads = [
      {
        id: "t",
        text: "x",
        kind: "action",
        status: "done",
        createdAt: "2026-08-01",
        doneAt: "2026-08-12T10:00:00",
      },
    ] as Thread[];
    const week = computeUsageWeek([], [], threads, wednesday.getTime());
    expect(week.doneToday).toBe(1);
    expect(week.movedToday).toBe(1);
  });
});
