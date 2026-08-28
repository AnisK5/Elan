import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  extractRelanceTurnOps,
  mergeTurnWrites,
  scopeGreffierUpdates,
  threadMentionedInTurn,
} from "./reconcile-turn";

const at = new Date("2026-08-28T10:00:00.000Z"); // vendredi

function thread(partial: Partial<Thread> & Pick<Thread, "id" | "text">): Thread {
  return {
    kind: "action",
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("threadMentionedInTurn", () => {
  it("matche Laura Kici dans le libellé", () => {
    const t = thread({
      id: "l",
      text: "Relancer Laura Kici (Thiga)",
    });
    expect(
      threadMentionedInTurn(t, "laura kici je prefere la relancer lundi"),
    ).toBe(true);
  });

  it("ignore France Travail si non nommé", () => {
    const t = thread({ id: "f", text: "France Travail — dossier" });
    expect(
      threadMentionedInTurn(t, "laura kici je prefere la relancer lundi"),
    ).toBe(false);
  });
});

describe("scopeGreffierUpdates", () => {
  const threads = [
    thread({ id: "l", text: "Relancer Laura Kici (Thiga)" }),
    thread({ id: "f", text: "France Travail — actualisation" }),
    thread({
      id: "r",
      text: "Réguliers",
      note: "linge de lit · ~2sem · 2026-08-01",
    }),
  ];

  it("écarte done sur trucs non mentionnés", () => {
    const updates = [
      { op: "done", id: "f" },
      { op: "note", id: "r", note: "linge de lit · ~2sem · 2026-08-28" },
      { op: "set", id: "l", plannedFor: "2026-09-01" },
    ];
    expect(
      scopeGreffierUpdates(threads, [
        {
          role: "user",
          content: "laura kici je prefere la relancer lundi",
        },
      ], updates),
    ).toEqual([{ op: "set", id: "l", plannedFor: "2026-09-01" }]);
  });
});

describe("extractRelanceTurnOps", () => {
  it("reporte une relance au lundi suivant", () => {
    const threads = [
      thread({ id: "l", text: "Relancer Laura Kici (Thiga)", kind: "action" }),
    ];
    const ops = extractRelanceTurnOps(
      threads,
      "laura kici je prefere la relancer lundi",
      at,
    );
    expect(ops).toContainEqual({
      op: "set",
      id: "l",
      kind: "suivi",
    });
    expect(ops).toContainEqual({
      op: "set",
      id: "l",
      plannedFor: "2026-08-31T12:00:00.000Z",
    });
    expect(ops.some((o) => o.op === "note" && o.note.includes("Relance prévue"))).toBe(
      true,
    );
  });
});

describe("mergeTurnWrites", () => {
  it("priorise le report code sur un done greffier erroné", () => {
    const threads = [
      thread({ id: "l", text: "Relancer Laura Kici (Thiga)" }),
      thread({ id: "f", text: "France Travail" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [{ role: "user", content: "laura kici je prefere la relancer lundi" }],
      [
        { op: "done", id: "f" },
        { op: "done", id: "l" },
      ],
      at,
    );
    expect(merged.some((o) => typeof o === "object" && o !== null && (o as { op?: string; id?: string }).op === "done" && (o as { id?: string }).id === "f")).toBe(
      false,
    );
    expect(merged.some((o) => typeof o === "object" && o !== null && (o as { op?: string; id?: string }).op === "done" && (o as { id?: string }).id === "l")).toBe(
      false,
    );
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { op?: string; plannedFor?: string }).op === "set" &&
          (o as { plannedFor?: string }).plannedFor?.startsWith("2026-08-31"),
      ),
    ).toBe(true);
  });
});
