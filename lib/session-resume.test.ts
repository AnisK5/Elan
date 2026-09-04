import { describe, expect, it } from "vitest";
import {
  RESUME_NUDGE_TEXT,
  isFreshActiveSession,
  shouldNudgeResume,
  withResumeNudge,
} from "./session-resume";

const started = "2026-09-04T08:00:00.000Z";

describe("isFreshActiveSession", () => {
  it("est fraîche si on a été là il y a 10 min", () => {
    const now = Date.parse("2026-09-04T10:00:00.000Z");
    expect(
      isFreshActiveSession(
        {
          startedAt: started,
          updatedAt: "2026-09-04T09:50:00.000Z",
          messages: [{ role: "assistant", content: "Go.", at: started }],
        },
        now,
      ),
    ).toBe(true);
  });

  it("reste fraîche sans message si on vient de lancer", () => {
    const now = Date.parse("2026-09-04T08:00:30.000Z");
    expect(
      isFreshActiveSession(
        { startedAt: started, messages: [] },
        now,
      ),
    ).toBe(true);
  });

  it("n'est plus fraîche après 2 h d'absence", () => {
    const now = Date.parse("2026-09-04T12:10:00.000Z");
    expect(
      isFreshActiveSession(
        {
          startedAt: started,
          updatedAt: "2026-09-04T10:00:00.000Z",
          messages: [{ role: "assistant", content: "Go.", at: started }],
        },
        now,
      ),
    ).toBe(false);
  });
});

describe("shouldNudgeResume", () => {
  it("propose On reprend après un trou, pas après un refresh", () => {
    const session = {
      startedAt: started,
      updatedAt: "2026-09-04T09:00:00.000Z",
      messages: [
        {
          role: "assistant",
          content: "Tu as le fichier ?",
          at: "2026-09-04T09:00:00.000Z",
        },
      ],
    };
    expect(
      shouldNudgeResume(session, Date.parse("2026-09-04T09:00:20.000Z")),
    ).toBe(false);
    expect(
      shouldNudgeResume(session, Date.parse("2026-09-04T09:05:00.000Z")),
    ).toBe(true);
  });
});

describe("withResumeNudge", () => {
  it("n'empile pas deux On reprend", () => {
    const msgs = [
      { role: "assistant" as const, content: RESUME_NUDGE_TEXT, at: started },
    ];
    expect(withResumeNudge(msgs)).toEqual(msgs);
  });
});
