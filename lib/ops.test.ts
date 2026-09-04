import { describe, expect, it } from "vitest";
import { noteFromTurnOps, parseThreadOps } from "./ops";
import { clean } from "./store";

const known = new Set(["a", "b"]);

describe("parseThreadOps — la porte d'entrée des écritures du modèle", () => {
  it("refuse un id inventé plutôt que de cocher au hasard", () => {
    expect(parseThreadOps([{ op: "done", id: "inconnu" }], known)).toEqual([]);
  });

  it("rattache un libellé unique (« coffre ») à l'id réel", () => {
    const threads = [
      { id: "a", text: "Rendre l'argent au coffre", status: "open" },
      { id: "b", text: "Appeler Sonia", status: "open" },
    ];
    expect(
      parseThreadOps([{ op: "done", id: "coffre" }], known, threads),
    ).toEqual([{ op: "done", id: "a" }]);
  });

  it("ne rattache pas un mot qui matche deux trucs", () => {
    const threads = [
      { id: "a", text: "Rendre l'argent au coffre", status: "open" },
      { id: "b", text: "Changer le code du coffre", status: "open" },
    ];
    expect(
      parseThreadOps([{ op: "done", id: "coffre" }], known, threads),
    ).toEqual([]);
  });

  it("laisse passer une opération valide", () => {
    expect(parseThreadOps([{ op: "done", id: "a" }], known)).toEqual([
      { op: "done", id: "a" },
    ]);
  });

  it("laisse passer une suppression demandée", () => {
    expect(parseThreadOps([{ op: "delete", id: "a" }], known)).toEqual([
      { op: "delete", id: "a" },
    ]);
  });

  it("ignore une opération qu'elle ne connaît pas", () => {
    expect(parseThreadOps([{ op: "explode", id: "a" }], known)).toEqual([]);
  });

  it("refuse une entrée qui n'est pas un tableau", () => {
    expect(parseThreadOps({ op: "done", id: "a" }, known)).toEqual([]);
    expect(parseThreadOps(null, known)).toEqual([]);
    expect(parseThreadOps("done", known)).toEqual([]);
  });

  it("plafonne un emballement du modèle", () => {
    const flood = Array.from({ length: 40 }, () => ({ op: "done", id: "a" }));
    expect(parseThreadOps(flood, known)).toHaveLength(12);
  });

  it("écarte une date hors du réel sans fabriquer d'opération vide", () => {
    expect(parseThreadOps([{ op: "set", id: "a", due: "0001-01-01" }], known)).toEqual(
      [],
    );
    expect(parseThreadOps([{ op: "set", id: "a", due: "pas une date" }], known)).toEqual(
      [],
    );
  });

  it("accepte une date réelle", () => {
    const [op] = parseThreadOps([{ op: "set", id: "a", due: "2026-08-05" }], known);
    expect(op).toMatchObject({ op: "set", id: "a" });
    expect(new Date((op as { due: string }).due).getFullYear()).toBe(2026);
  });

  it("garde plannedFor sur un add", () => {
    const [op] = parseThreadOps(
      [
        {
          op: "add",
          text: "Poser 30€ en commission",
          kind: "action",
          plannedFor: "2026-08-29",
        },
      ],
      new Set(),
    );
    expect(op).toMatchObject({ op: "add", text: "Poser 30€ en commission" });
    expect((op as { plannedFor: string }).plannedFor.slice(0, 10)).toBe(
      "2026-08-29",
    );
  });

  it("distingue mettre en pause de prévoir", () => {
    expect(parseThreadOps([{ op: "snooze", id: "a", until: "2026-08-01" }], known))
      .toHaveLength(1);
    // plannedFor: null annule une intention, ce n'est pas une valeur invalide
    expect(parseThreadOps([{ op: "set", id: "a", plannedFor: null }], known)).toEqual([
      { op: "set", id: "a", plannedFor: null },
    ]);
  });

  it("refuse un add sans nature", () => {
    expect(parseThreadOps([{ op: "add", text: "truc" }], known)).toEqual([]);
    expect(parseThreadOps([{ op: "add", text: "truc", kind: "bidule" }], known)).toEqual(
      [],
    );
  });

  it("accepte un add complet et nettoie son texte", () => {
    const [op] = parseThreadOps(
      [{ op: "add", text: "**relancer Paul**", kind: "action", effort: "S" }],
      known,
    );
    expect(op).toMatchObject({ op: "add", text: "relancer Paul", kind: "action" });
  });

  it("refuse un effort ou une nature fantaisistes", () => {
    expect(parseThreadOps([{ op: "set", id: "a", effort: "XL" }], known)).toEqual([]);
    expect(parseThreadOps([{ op: "set", id: "a", kind: "urgent" }], known)).toEqual([]);
  });

  it("n'efface JAMAIS une intention à cause d'une date qu'elle ne sait pas lire", () => {
    // Le modèle a pour consigne d'ancrer les dates en absolu, mais s'il écrit
    // quand même « jeudi », l'ignorer est la seule issue acceptable : retomber
    // sur null effacerait le jour déjà prévu et le truc ne remonterait plus.
    expect(parseThreadOps([{ op: "set", id: "a", plannedFor: "jeudi" }], known)).toEqual(
      [],
    );
    expect(
      parseThreadOps([{ op: "set", id: "a", plannedFor: "0001-01-01" }], known),
    ).toEqual([]);
  });
});

describe("le jour de sortie posé sur tout le lot", () => {
  const courses = new Set(["colis", "pharmacie", "banque"]);

  it("garde une intention identique sur chaque truc du lot", () => {
    const ops = parseThreadOps(
      [
        { op: "set", id: "colis", plannedFor: "2026-08-06" },
        { op: "set", id: "pharmacie", plannedFor: "2026-08-06" },
        { op: "set", id: "banque", plannedFor: "2026-08-06" },
      ],
      courses,
    );
    expect(ops).toHaveLength(3);
    for (const op of ops) {
      expect(new Date((op as { plannedFor: string }).plannedFor).getDate()).toBe(6);
    }
  });

  it("laisse la note porter l'heure et le kit à côté du jour", () => {
    const ops = parseThreadOps(
      [
        { op: "set", id: "colis", plannedFor: "2026-08-06" },
        {
          op: "note",
          id: "colis",
          note: "sortie calée jeudi 06/08 17h, enveloppe timbrée près de la porte",
        },
      ],
      courses,
    );
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({ op: "note", id: "colis" });
    expect((ops[1] as { note: string }).note).toContain("17h");
  });

  it("ne laisse pas un gros lot manger le plafond en silence", () => {
    // Un jour + une note par truc : au-delà de six courses, le lot dépasse les
    // douze opérations et la fin est tronquée. Le plafond tient, mais c'est la
    // limite réelle d'une sortie réconciliée en une passe.
    const gros = new Set(Array.from({ length: 8 }, (_, i) => `c${i}`));
    const raw = Array.from({ length: 8 }, (_, i) => [
      { op: "set", id: `c${i}`, plannedFor: "2026-08-06" },
      { op: "note", id: `c${i}`, note: "sortie jeudi 17h" },
    ]).flat();
    expect(parseThreadOps(raw, gros)).toHaveLength(12);
  });
});

describe("clean — le balisage des modèles ne doit pas atteindre la base", () => {
  it("retire les balises de citation et leurs indices", () => {
    expect(clean('it <cite index="15-1,15-2">65€ envoyés via Wero')).toBe(
      "it 65€ envoyés via Wero",
    );
  });

  it("retire le gras markdown sans manger le texte", () => {
    expect(clean("**rendre l'argent** au coffre")).toBe("rendre l'argent au coffre");
  });

  it("survit au vide", () => {
    expect(clean(undefined)).toBe("");
    expect(clean("   ")).toBe("");
  });

  it("garde les lignes du fil Réguliers", () => {
    expect(clean("linge de lit · ~2sem · 2026-08-18\nURSSAF · ~1mois · 2026-07-01")).toBe(
      "linge de lit · ~2sem · 2026-08-18\nURSSAF · ~1mois · 2026-07-01",
    );
  });
});

describe("noteFromTurnOps — résumé de CE tour seulement", () => {
  it("ne sort qu'une courte ligne depuis les ops appliquées", () => {
    const threads = [
      { id: "a", text: "Réguliers", note: "linge · ~2sem · 2026-08-01" },
      { id: "b", text: "50€ et RDV psy", note: "" },
    ];
    expect(
      noteFromTurnOps(
        [
          {
            op: "note",
            id: "a",
            note: "linge · ~2sem · 2026-09-04",
          },
        ],
        threads,
      ),
    ).toBe("linge · régulier à jour");
  });

  it("ignore l'historique : une seule op done → un seul ✓", () => {
    const threads = [
      { id: "a", text: "50€ et RDV psy" },
      { id: "b", text: "appel papa" },
    ];
    expect(noteFromTurnOps([{ op: "done", id: "a" }], threads)).toBe(
      "50€ et RDV psy ✓",
    );
  });

  it("dit « retiré » pour une suppression", () => {
    expect(
      noteFromTurnOps(
        [{ op: "delete", id: "b" }],
        [{ id: "b", text: "Message à papa" }],
      ),
    ).toBe("Message à papa retiré");
  });
});
