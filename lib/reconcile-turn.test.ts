import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/types";
import {
  extractRelanceTurnOps,
  looksLikeDoneClaim,
  mergeTurnWrites,
  scopeGreffierUpdates,
  stampWhenOnAdds,
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

describe("looksLikeDoneClaim", () => {
  it("entend un achat / une résa nommée", () => {
    expect(looksLikeDoneClaim("j'ai pris mes billets et réservé")).toBe(true);
    expect(looksLikeDoneClaim("j'ai acheté le billet Bangkok")).toBe(true);
    expect(looksLikeDoneClaim("billets pris")).toBe(true);
  });

  it("n'entend pas un « je réserve » au futur", () => {
    expect(looksLikeDoneClaim("je réserve ça pour plus tard")).toBe(false);
    expect(looksLikeDoneClaim("j'ai réservé")).toBe(false);
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

  it("accepte un « oui » seulement si Élan demandait si c'était fait", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "Laura Kici — c'est envoyé ?",
          },
          { role: "user", content: "oui" },
        ],
        [{ op: "done", id: "l" }, { op: "done", id: "f" }],
      ),
    ).toEqual([{ op: "done", id: "l" }]);
  });

  it("n'ancre pas un « ok on y va » sur un done", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "On s'y met ?",
          },
          { role: "user", content: "ok" },
        ],
        [{ op: "done", id: "l" }],
      ),
    ).toEqual([]);
  });

  it("accepte « c'est fait » ancré sur le truc proposé", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "assistant",
            content: "On coche France Travail ?",
          },
          { role: "user", content: "c'est fait" },
        ],
        [{ op: "done", id: "f" }],
      ),
    ).toEqual([{ op: "done", id: "f" }]);
  });

  it("laisse écrire Réguliers quand le tour pose une cadence de vie", () => {
    expect(
      scopeGreffierUpdates(
        threads,
        [
          {
            role: "user",
            content:
              "tous les 4 mois, c'est super important que je fasse un bilan sanguin",
          },
        ],
        [
          {
            op: "note",
            id: "r",
            note: "bilan sanguin · ~4mois · 2026-04-20",
          },
        ],
      ),
    ).toEqual([
      {
        op: "note",
        id: "r",
        note: "bilan sanguin · ~4mois · 2026-04-20",
      },
    ]);
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

  it("coche le truc proposé même si le greffier n'écrit rien — « c'est déjà fait »", () => {
    const threads = [
      thread({ id: "ps", text: "Message à PS pour RDV médecin" }),
      thread({ id: "psy", text: "Message psychiatre RDV TDA + attestation" }),
      thread({ id: "papa", text: "Message à papa (Omar)" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Le message à PS d'abord — tu lui demandes un RDV médecin pour le médicament.",
        },
        { role: "user", content: "c'est déjà fait" },
        {
          role: "assistant",
          content:
            "Nickel ! Et le message à la psychiatre, tu veux qu'on l'envoie maintenant ?",
        },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "done", id: "ps" }]);
  });

  it("coche sur « mets que c'est fait » le truc de la question d'avant, pas la réplique suivante", () => {
    const threads = [
      thread({ id: "ps", text: "Message à PS pour RDV médecin" }),
      thread({ id: "psy", text: "Message psychiatre RDV TDA + attestation" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Et le message à la psychiatre pour le RDV TDA + l'attestation, tu veux qu'on l'envoie maintenant ?",
        },
        {
          role: "user",
          content:
            "j'ai dit que j'allais le faire pendant le rdv donc mets que c'est fait",
        },
        { role: "assistant", content: "Noté. Et les draps, ils sont faits ?" },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "done", id: "psy" }]);
  });

  it("retire le truc de la question d'avant sur « tu peux supprimer cette tâche »", () => {
    const threads = [
      thread({ id: "papa", text: "Message à papa (Omar)" }),
      thread({ id: "darty", text: "Darty Max — lave-vaisselle" }),
    ];
    const merged = mergeTurnWrites(
      threads,
      [
        {
          role: "assistant",
          content:
            "Message à papa maintenant — lui rappeler de contacter le père d'Omar à Casablanca.",
        },
        { role: "user", content: "tu peux supprimer cette tache" },
      ],
      [],
    );
    expect(merged).toEqual([{ op: "delete", id: "papa" }]);
  });
});

describe("stampWhenOnAdds", () => {
  it("pose le jour sur l'add et ancre la note au lieu de laisser « demain »", () => {
    const stamped = stampWhenOnAdds(
      [
        {
          role: "user",
          content: "je dois poser 30€ en commission demain matin",
        },
      ],
      [
        {
          op: "add",
          text: "Poser 30€ en comm",
          kind: "action",
          note: "À faire demain matin — rappel pour demain.",
        },
      ],
      at,
    );
    expect(stamped[0]).toMatchObject({
      op: "add",
      text: "Poser 30€ en comm",
      plannedFor: "2026-08-29",
    });
    const note = (stamped[0] as { note: string }).note;
    expect(note).not.toMatch(/demain/i);
    expect(note).toMatch(/samedi 29\/08\/2026/);
  });

  it("n'invente pas une intention sur « pas avant demain »", () => {
    expect(
      stampWhenOnAdds(
        [{ role: "user", content: "pas avant demain pour le colis" }],
        [{ op: "add", text: "Poster le colis", kind: "action" }],
        at,
      ),
    ).toEqual([{ op: "add", text: "Poster le colis", kind: "action" }]);
  });
});
