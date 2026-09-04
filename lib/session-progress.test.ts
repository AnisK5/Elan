import { describe, expect, it } from "vitest";
import type { Thread } from "./types";
import {
  progressDuringSession,
  wrapUpHeadline,
} from "./session-progress";

function thread(partial: Partial<Thread> & Pick<Thread, "id">): Thread {
  return {
    text: "x",
    kind: "action",
    status: "open",
    createdAt: "2026-09-04T08:00:00.000Z",
    ...partial,
  };
}

const start = "2026-09-04T10:00:00.000Z";

describe("progressDuringSession", () => {
  it("sépare réglé et avancé, sans compter le zéro", () => {
    expect(
      progressDuringSession(
        [
          thread({
            id: "a",
            status: "done",
            doneAt: "2026-09-04T10:05:00.000Z",
            touchedAt: "2026-09-04T10:05:00.000Z",
          }),
          thread({
            id: "b",
            touchedAt: "2026-09-04T10:12:00.000Z",
            note: "Billet acheté. Prochaine étape : hébergements.",
          }),
          thread({ id: "c" }),
        ],
        start,
      ),
    ).toEqual({ done: 1, advanced: 1 });
  });

  it("ignore ce qui n'a pas bougé dans la séance", () => {
    expect(
      progressDuringSession(
        [
          thread({
            id: "old",
            touchedAt: "2026-09-03T18:00:00.000Z",
          }),
        ],
        start,
      ),
    ).toEqual({ done: 0, advanced: 0 });
  });
});

describe("wrapUpHeadline", () => {
  it("ne dit jamais 0 faits", () => {
    expect(wrapUpHeadline(0, 0).celebrate).toBe(false);
    expect(wrapUpHeadline(0, 2).lead).toMatch(/avancé sur 2/);
    expect(wrapUpHeadline(1, 0).lead).toMatch(/réglé/);
  });
});
