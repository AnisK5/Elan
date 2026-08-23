import { describe, expect, it } from "vitest";
import {
  findTrucInText,
  indexOfTruc,
  splitAroundTruc,
  speechRuns,
  trucLabels,
} from "./emphasize-truc";
import type { Thread } from "./types";

describe("emphasize-truc", () => {
  it("trouve le plus long libellé", () => {
    expect(
      findTrucInText("On s'occupe du linge de lit ce matin.", [
        "linge",
        "linge de lit",
      ]),
    ).toEqual({ start: 15, match: "linge de lit" });
  });

  it("ne coupe pas un mot plus long", () => {
    expect(indexOfTruc("Pauline a appelé.", "Paul")).toBe(-1);
    expect(indexOfTruc("J'ai appelé Paul hier.", "Paul")).toBeGreaterThan(-1);
  });

  it("découpe autour du truc", () => {
    expect(
      splitAroundTruc("On peut s'occuper du linge de lit aujourd'hui.", [
        "linge de lit",
      ]),
    ).toEqual({
      before: "On peut s'occuper du ",
      match: "linge de lit",
      after: " aujourd'hui.",
    });
  });

  it("prend les réguliers dans le conteneur", () => {
    const threads = [
      {
        id: "1",
        text: "Réguliers",
        kind: "action",
        status: "open",
        createdAt: "2026-01-01",
        note: "linge de lit · ~2sem · 2026-01-01",
      },
    ] as Thread[];
    expect(trucLabels(threads)).toEqual(["linge de lit"]);
  });

  it("rend **gras** au lieu de laisser les astérisques", () => {
    expect(
      speechRuns("appeler **Orange pour l'éligibilité fibre**, c'est calé.", []),
    ).toEqual([
      { text: "appeler ", strong: false },
      { text: "Orange pour l'éligibilité fibre", strong: true },
      { text: ", c'est calé.", strong: false },
    ]);
  });

  it("gras approximatif si le modèle paraphrase le libellé", () => {
    const text =
      "relancer l'impression de son doc sur la donation, qu'il attend depuis un moment.";
    expect(findTrucInText(text, ["Impression doc donation papa"])).toEqual({
      start: text.indexOf("impression"),
      match: "impression de son doc sur la donation",
    });
  });

  it("met en gras le libellé entier, pas un mot isolé", () => {
    const runs = speechRuns(
      "On s'occupe du linge de lit, pas du reste.",
      ["linge de lit", "Imprimer le doc de papa sur la donation en Espagne"],
    );
    const strong = runs.filter((r) => r.strong).map((r) => r.text);
    expect(strong).toEqual(["linge de lit"]);
  });

  it("ne saupoudre pas les mots d'un titre long", () => {
    const asie =
      "Regarder billets et destinations Asie du Sud-Est (voyage solo)";
    const runs = speechRuns(
      "Je te propose 30 min pour qu'on commence à explorer les billets et destinations pour l'Asie — l'objectif, pas un billet. Les patins, ou il faut les commander ?",
      [asie, "Commander les patins des chaises"],
    );
    expect(runs.some((r) => r.strong)).toBe(false);
  });

  it("ignore le **gras** du modèle s'il n'est qu'un mot", () => {
    const runs = speechRuns(
      "on **commence** par les **billets** et l'**objectif**.",
      [],
    );
    expect(runs.some((r) => r.strong)).toBe(false);
    expect(runs.map((r) => r.text).join("")).toContain("commence");
  });

  it("garde les libellés des trucs déjà réglés", () => {
    const threads = [
      {
        id: "1",
        text: "le coffre",
        kind: "action",
        status: "done",
        createdAt: "2026-01-01",
      },
    ] as Thread[];
    expect(trucLabels(threads)).toEqual(["le coffre"]);
  });

  it("ne gras pas un mot juste parce qu'il est capitalisé", () => {
    const runs = speechRuns("On relance Laura en un message.", []);
    expect(runs.some((r) => r.strong)).toBe(false);
  });
});
