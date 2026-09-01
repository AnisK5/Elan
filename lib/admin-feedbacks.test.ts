import { describe, expect, it } from "vitest";
import { buildAdminFeedbacksList } from "./admin-feedbacks";

describe("buildAdminFeedbacksList", () => {
  it("enrichit les retours avec email et nom", () => {
    const snap = buildAdminFeedbacksList(
      [
        {
          id: "f1",
          userId: "u1",
          message: "Super app",
          mood: "bien",
          source: "settings",
          createdAt: "2026-09-01T10:00:00Z",
        },
      ],
      new Map([["u1", "alice@x.com"]]),
      new Map([["u1", "Alice"]]),
    );

    expect(snap.total).toBe(1);
    expect(snap.feedbacks[0]).toMatchObject({
      email: "alice@x.com",
      name: "Alice",
      message: "Super app",
    });
  });
});
