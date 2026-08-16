import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  backlogCounts,
  cadenceToDays,
  dueReguliers,
  isRegulierDue,
  parseReguliers,
  reguliersDueFromThreads,
  serializeReguliers,
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

describe("parseReguliers", () => {
  it("parse les lignes structurées", () => {
    const items = parseReguliers(
      "URSSAF · ~1mois · 2026-07-01\ndraps · ~2sem · 2026-07-28 · maison",
    );
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("URSSAF");
    expect(items[1].note).toBe("maison");
  });

  it("round-trip serialize", () => {
    const raw = "draps · ~2sem · 2026-07-28";
    expect(serializeReguliers(parseReguliers(raw))).toBe(raw);
  });
});

describe("cadence et échéance douce", () => {
  it("convertit les cadences", () => {
    expect(cadenceToDays("~2sem")).toBe(14);
    expect(cadenceToDays("~1mois")).toBe(30);
  });

  it("marque mûr après la cadence", () => {
    const item = {
      label: "draps",
      cadence: "~2sem",
      lastDone: "2026-07-28",
    };
    expect(isRegulierDue(item, at)).toBe(true);
    expect(isRegulierDue({ ...item, lastDone: "2026-08-10" }, at)).toBe(false);
  });
});

describe("backlogCounts", () => {
  it("ne compte pas Réguliers si rien de mûr", () => {
    const threads = [
      thread({ id: "a", text: "mail Paul" }),
      thread({
        id: "e",
        text: "Réguliers",
        note: "draps · ~2sem · 2026-08-10",
      }),
    ];
    expect(backlogCounts(threads, at).open).toBe(1);
  });

  it("reconnaît les noms legacy", () => {
    const threads = [
      thread({
        id: "e",
        text: "Entretiens",
        note: "draps · ~2sem · 2026-07-28",
      }),
    ];
    expect(backlogCounts(threads, at).open).toBe(1);
  });

  it("compte Réguliers une fois si un régulier est mûr", () => {
    const threads = [
      thread({ id: "a", text: "mail Paul" }),
      thread({
        id: "e",
        text: "Réguliers",
        note: "draps · ~2sem · 2026-07-28",
      }),
    ];
    expect(backlogCounts(threads, at).open).toBe(2);
  });
});

describe("reguliersDueFromThreads", () => {
  it("retourne les réguliers mûrs", () => {
    const threads = [
      thread({
        id: "e",
        text: "Réguliers",
        note: "draps · ~2sem · 2026-07-28\nURSSAF · ~1mois · 2026-08-01",
      }),
    ];
    const due = reguliersDueFromThreads(threads, at);
    expect(due.map((d) => d.label)).toEqual(["draps"]);
    expect(dueReguliers(parseReguliers(threads[0].note), at)).toEqual(due);
  });
});
