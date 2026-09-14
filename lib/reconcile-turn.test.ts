import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  extractCallStatusTurnOps,
  extractRelanceTurnOps,
  findThreadFromSessionContext,
  isSyncMetaCommand,
  mergeTurnWrites,
  scopeGreffierUpdates,
  threadMentionedInTurn,
  userTextForTurnScope,
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

describe("isSyncMetaCommand", () => {
  it("détecte mets à jour", () => {
    expect(isSyncMetaCommand("mets a jour")).toBe(true);
    expect(isSyncMetaCommand("mets à jour")).toBe(true);
  });
});

describe("userTextForTurnScope", () => {
  it("élargit le tour sur mets à jour", () => {
    const scope = userTextForTurnScope([
      {
        role: "user",
        content:
          "c'est bon j'ai appelé mais il doit me rappeler dans la journee",
      },
      {
        role: "assistant",
        content:
          "Le suivi Darty Max est en attente de leur rappel aujourd'hui.",
      },
      { role: "user", content: "mets a jour" },
    ]);
    expect(scope).toContain("Darty Max");
    expect(scope).toContain("mets a jour");
  });
});

describe("findThreadFromSessionContext", () => {
  const darty = thread({
    id: "d",
    text: "Appeler Darty Max pour connaître le process de réparation",
    note: "À faire au retour (après le 28/08/2026).",
  });

  it("retrouve Darty depuis l'ouverture de séance", () => {
    expect(
      findThreadFromSessionContext([darty], [
        {
          role: "assistant",
          content:
            "On prend 5 minutes pour un appel à Darty Max au sujet du lave-vaisselle.",
        },
        {
          role: "user",
          content: "c'est bon j'ai appelé mais il doit me rappeler dans la journee",
        },
      ]),
    ).toEqual(darty);
  });
});

describe("extractCallStatusTurnOps", () => {
  const darty = thread({
    id: "d",
    text: "Appeler Darty Max pour connaître le process de réparation",
    note: "À faire au retour (après le 28/08/2026).",
  });

  it("persiste appel + attente rappel + plan B demain", () => {
    const messages = [
      {
        role: "assistant" as const,
        content:
          "On prend 5 minutes pour un appel à Darty Max au sujet du lave-vaisselle.",
      },
      {
        role: "user" as const,
        content:
          "c'est bon j'ai appelé mais il doit me rappeler dans la journee, sinon faudrait reflechir a une autre facon d'avoir la reponse a partir de demain par ex",
      },
    ];
    const ops = extractCallStatusTurnOps([darty], messages, at);
    expect(ops).toContainEqual({ op: "set", id: "d", kind: "suivi" });
    expect(
      ops.some(
        (o) =>
          o.op === "note" &&
          o.note.includes("Appelé le 28/08/2026") &&
          o.note.includes("En attente de rappel") &&
          o.note.includes("Plan B"),
      ),
    ).toBe(true);
    expect(
      ops.some(
        (o) =>
          o.op === "set" &&
          o.plannedFor?.startsWith("2026-08-29"),
      ),
    ).toBe(true);
  });

  it("persiste aussi sur mets a jour après confirmation Élan", () => {
    const messages = [
      {
        role: "assistant" as const,
        content:
          "On prend 5 minutes pour un appel à Darty Max au sujet du lave-vaisselle.",
      },
      {
        role: "user" as const,
        content:
          "c'est bon j'ai appelé mais il doit me rappeler dans la journee",
      },
      {
        role: "assistant" as const,
        content:
          "Le suivi Darty Max est en attente de leur rappel aujourd'hui, plan B demain.",
      },
      { role: "user" as const, content: "mets a jour" },
    ];
    const ops = extractCallStatusTurnOps([darty], messages, at);
    expect(ops.some((o) => o.op === "set" && o.id === "d" && o.kind === "suivi")).toBe(
      true,
    );
    expect(ops.some((o) => o.op === "note" && o.note.includes("Darty") === false && o.note.includes("Appelé"))).toBe(
      true,
    );
  });
});

describe("scopeGreffierUpdates — sync meta", () => {
  const darty = thread({
    id: "d",
    text: "Appeler Darty Max pour connaître le process de réparation",
  });

  it("garde les ops Darty quand le tour est mets a jour", () => {
    const updates = [
      { op: "set", id: "d", kind: "suivi" },
      { op: "note", id: "d", note: "Appelé le 14/09/2026. En attente de rappel." },
    ];
    expect(
      scopeGreffierUpdates(
        [darty],
        [
          {
            role: "user",
            content:
              "c'est bon j'ai appelé mais il doit me rappeler dans la journee",
          },
          {
            role: "assistant",
            content: "Le suivi Darty Max est en attente de rappel.",
          },
          { role: "user", content: "mets a jour" },
        ],
        updates,
      ),
    ).toEqual(updates);
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
