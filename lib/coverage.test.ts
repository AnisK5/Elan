import { describe, expect, it } from "vitest";
import { coverageSnapshot, PASSAGE_DAYS, STARVE_DAYS } from "./coverage";
import type { Thread } from "./types";

function daysAgoIso(n: number, at: Date): string {
  const d = new Date(at);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function t(
  partial: Partial<Thread> & { id: string; text: string },
  at: Date,
): Thread {
  return {
    status: "open",
    kind: "action",
    createdAt: daysAgoIso(3, at),
    ...partial,
  };
}

describe("coverageSnapshot", () => {
  const at = new Date("2026-09-04T12:00:00.000Z");

  it("classe affamé vs file selon l'âge sans DL", () => {
    const snap = coverageSnapshot(
      [
        t(
          {
            id: "s",
            text: "Dossier kayak",
            createdAt: daysAgoIso(STARVE_DAYS + 2, at),
          },
          at,
        ),
        t(
          {
            id: "p",
            text: "Mail assurance",
            createdAt: daysAgoIso(PASSAGE_DAYS + 1, at),
            touchedAt: daysAgoIso(PASSAGE_DAYS + 1, at),
          },
          at,
        ),
        t(
          {
            id: "ok",
            text: "Carte vitale",
            createdAt: daysAgoIso(2, at),
            touchedAt: daysAgoIso(2, at),
          },
          at,
        ),
      ],
      undefined,
      at,
    );
    expect(snap.starved.map((i) => i.id)).toEqual(["s"]);
    expect(snap.passageDue.map((i) => i.id)).toEqual(["p"]);
    expect(snap.mixRequired).toBe(true);
  });

  it("n'envoie pas une DL du jour dans la file", () => {
    const today = "2026-09-04";
    const snap = coverageSnapshot(
      [
        t(
          {
            id: "dl",
            text: "URSSAF",
            due: today,
            createdAt: daysAgoIso(20, at),
          },
          at,
        ),
      ],
      undefined,
      at,
    );
    expect(snap.starved).toEqual([]);
    expect(snap.passageDue).toEqual([]);
    expect(snap.mixRequired).toBe(false);
  });

  it("demande plus de volume si plusieurs affamés", () => {
    const snap = coverageSnapshot(
      [
        t(
          { id: "a", text: "A", createdAt: daysAgoIso(20, at) },
          at,
        ),
        t(
          { id: "b", text: "B", createdAt: daysAgoIso(18, at) },
          at,
        ),
      ],
      { minutesLast7: 15, sessionsLast7: 1 },
      at,
    );
    expect(snap.moreVolume).toBe(true);
  });

  it("n'affame pas un truc dont la due est encore loin", () => {
    const snap = coverageSnapshot(
      [
        t(
          {
            id: "later",
            text: "Déclaration",
            due: "2026-09-20",
            createdAt: daysAgoIso(40, at),
          },
          at,
        ),
      ],
      undefined,
      at,
    );
    expect(snap.starved).toEqual([]);
    expect(snap.mixRequired).toBe(false);
  });
});
