import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  backlogCounts,
  cadenceToDays,
  dueEntretiens,
  entretiensDueFromThreads,
  isEntretienDue,
  parseEntretiens,
  serializeEntretiens,
} from "@/lib/entretiens";

const at = new Date("2026-08-13T12:00:00");

function thread(partial: Partial<Thread> & Pick<Thread, "id">): Thread {
  return {
    text: "x",
    kind: "action",
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("parseEntretiens", () => {
  it("parse les lignes structurées", () => {
    const items = parseEntretiens(
      "draps · ~2sem · 2026-07-28\nfrigo · ~1mois · 2026-07-01 · garde propre",
    );
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("draps");
    expect(items[1].note).toBe("garde propre");
  });

  it("round-trip serialize", () => {
    const raw = "draps · ~2sem · 2026-07-28";
    expect(serializeEntretiens(parseEntretiens(raw))).toBe(raw);
  });
});

describe("cadence et échéance douce", () => {
  it("convertit les cadences", () => {
    expect(cadenceToDays("~2sem")).toBe(14);
    expect(cadenceToDays("~1mois")).toBe(30);
    expect(cadenceToDays("~10j")).toBe(10);
  });

  it("marque mûr après la cadence", () => {
    const item = {
      label: "draps",
      cadence: "~2sem",
      lastDone: "2026-07-28",
    };
    expect(isEntretienDue(item, at)).toBe(true);
    expect(isEntretienDue({ ...item, lastDone: "2026-08-10" }, at)).toBe(false);
  });
});

describe("backlogCounts", () => {
  it("ne compte pas Entretiens si rien de mûr", () => {
    const threads = [
      thread({ id: "a", text: "mail Paul" }),
      thread({
        id: "e",
        text: "Entretiens",
        note: "draps · ~2sem · 2026-08-10",
      }),
    ];
    expect(backlogCounts(threads, at).open).toBe(1);
  });

  it("compte Entretiens une fois si un entretien est mûr", () => {
    const threads = [
      thread({ id: "a", text: "mail Paul" }),
      thread({
        id: "e",
        text: "Entretiens",
        note: "draps · ~2sem · 2026-07-28",
      }),
    ];
    expect(backlogCounts(threads, at).open).toBe(2);
  });
});

describe("entretiensDueFromThreads", () => {
  it("retourne les entretiens mûrs", () => {
    const threads = [
      thread({
        id: "e",
        text: "Entretiens",
        note: "draps · ~2sem · 2026-07-28\nfrigo · ~1mois · 2026-08-01",
      }),
    ];
    const due = entretiensDueFromThreads(threads, at);
    expect(due.map((d) => d.label)).toEqual(["draps"]);
    expect(dueEntretiens(parseEntretiens(threads[0].note), at)).toEqual(due);
  });
});
