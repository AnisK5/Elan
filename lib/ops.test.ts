import { describe, expect, it } from "vitest";
import { parseThreadOps } from "./ops";
import { clean } from "./store";

const known = new Set(["a", "b"]);

describe("parseThreadOps — la porte d'entrée des écritures du modèle", () => {
  it("refuse un id inventé plutôt que de cocher au hasard", () => {
    expect(parseThreadOps([{ op: "done", id: "inconnu" }], known)).toEqual([]);
  });

  it("laisse passer une opération valide", () => {
    expect(parseThreadOps([{ op: "done", id: "a" }], known)).toEqual([
      { op: "done", id: "a" },
    ]);
  });

  it("ignore une opération qu'elle ne connaît pas", () => {
    expect(parseThreadOps([{ op: "delete", id: "a" }], known)).toEqual([]);
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
});
