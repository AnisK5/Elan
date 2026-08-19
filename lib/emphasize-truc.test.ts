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
});
