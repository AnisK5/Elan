import { describe, expect, it } from "vitest";
import { buildAdminSnapshot } from "./admin-stats";

describe("buildAdminSnapshot", () => {
  const now = new Date("2026-08-23T12:00:00Z");

  it("calcule DAU / WAU et rétention J1", () => {
    const snap = buildAdminSnapshot(
      [
        { id: "a", email: "a@x", createdAt: "2026-08-22T10:00:00Z" },
        { id: "b", email: "b@x", createdAt: "2026-08-10T10:00:00Z" },
        { id: "c", email: "c@x", createdAt: "2026-08-01T10:00:00Z" },
      ],
      [
        { userId: "a", kind: "open", at: "2026-08-22T10:00:00Z", day: "2026-08-22" },
        { userId: "a", kind: "aside", at: "2026-08-23T09:00:00Z", day: "2026-08-23" },
        { userId: "b", kind: "open", at: "2026-08-23T08:00:00Z", day: "2026-08-23" },
      ],
      [
        { userId: "a", date: "2026-08-23T09:10:00Z", durationMin: 12 },
        { userId: "c", date: "2026-08-02T09:00:00Z", durationMin: 8 },
      ],
      [{ userId: "a", at: "2026-08-23T09:20:00Z" }],
      now,
    );
    expect(snap.totals.signups).toBe(3);
    expect(snap.totals.dau).toBe(2);
    expect(snap.totals.activatedPct).toBe(67);
    expect(snap.totals.d1).toBe(67);
    expect(snap.users.find((u) => u.id === "a")?.activated).toBe(true);
  });
});
