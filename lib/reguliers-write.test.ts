import { describe, expect, it } from "vitest";
import type { ChatMessage, Thread } from "@/lib/types";
import {
  extractReguliersFromConvo,
  mergeRegulierWrites,
  upsertRegulierOps,
} from "./reguliers-write";

const at = new Date("2026-08-18T14:00:00.000Z");

function thread(partial: Partial<Thread> & Pick<Thread, "id">): Thread {
  return {
    text: "x",
    kind: "action",
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("extractReguliersFromConvo", () => {
  it("attrape linge + fréquence même si Élan dit déjà noté", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content:
          "je lave rarement le linge de mon lit, ça serait bien que je le fasse, tu me recommandes quelle fréquence",
      },
      {
        role: "assistant",
        content:
          "On l'a réglé juste avant : tu es parti sur toutes les semaine et demie à deux semaines, et je le porte déjà comme truc récurrent.",
      },
    ];
    expect(extractReguliersFromConvo(messages, at)).toEqual([
      { label: "linge de lit", cadence: "~2sem", lastDone: "2026-08-04" },
    ]);
  });

  it("réécrit quand elle dit que le fil est vide", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content:
          "pourtant il y a rien dans regulier — le linge de lit toutes les 2 semaines pourtant",
      },
    ];
    expect(extractReguliersFromConvo(messages, at)[0]?.label).toBe(
      "linge de lit",
    );
  });

  it("ne force pas si elle dit non", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "draps toutes les 2 semaines ?" },
      { role: "assistant", content: "Oui, ~2sem ça tient." },
      { role: "user", content: "non" },
    ];
    expect(extractReguliersFromConvo(messages, at)).toEqual([]);
  });

  it("ignore l'historique linge quand le tour parle de Laura", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "le linge de lit toutes les 2 semaines",
      },
      {
        role: "assistant",
        content: "C'est noté dans Réguliers.",
      },
      {
        role: "user",
        content: "laura kici je prefere la relancer lundi",
      },
    ];
    expect(extractReguliersFromConvo(messages, at)).toEqual([]);
  });

  it("met un bilan sanguin tous les 4 mois dans Réguliers, pas en tâche", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content:
          "tous les 4 mois, c'est super important que je fasse un bilan sanguin pour voir l'evolution santé",
      },
    ];
    expect(extractReguliersFromConvo(messages, at)).toEqual([
      { label: "bilan sanguin", cadence: "~4mois", lastDone: "2026-04-20" },
    ]);
  });

  it("n'attrape pas une relance à cadence comme un régulier", () => {
    expect(
      extractReguliersFromConvo(
        [
          {
            role: "user",
            content: "je dois relancer Laura toutes les 2 semaines",
          },
        ],
        at,
      ),
    ).toEqual([]);
  });

  it("n'attrape pas « dans 4 mois » comme une cadence de vie", () => {
    expect(
      extractReguliersFromConvo(
        [
          {
            role: "user",
            content: "je dois faire un bilan sanguin dans 4 mois",
          },
        ],
        at,
      ),
    ).toEqual([]);
  });
});

describe("upsertRegulierOps", () => {
  it("crée le fil Réguliers s'il n'existe pas", () => {
    const ops = upsertRegulierOps(
      [],
      [{ label: "linge de lit", cadence: "~2sem", lastDone: "2026-08-18" }],
    );
    expect(ops).toEqual([
      {
        op: "add",
        text: "Réguliers",
        kind: "action",
        note: "linge de lit · ~2sem · 2026-08-18",
      },
    ]);
  });

  it("fusionne dans le fil existant sans écraser les autres lignes", () => {
    const threads = [
      thread({
        id: "r",
        text: "Réguliers",
        note: "URSSAF · ~1mois · 2026-07-01",
      }),
    ];
    const ops = upsertRegulierOps(threads, [
      { label: "linge de lit", cadence: "~2sem", lastDone: "2026-08-18" },
    ]);
    expect(ops).toEqual([
      {
        op: "note",
        id: "r",
        note: "URSSAF · ~1mois · 2026-07-01\nlinge de lit · ~2sem · 2026-08-18",
      },
    ]);
  });

  it("ne réécrit pas si la ligne est déjà là", () => {
    const threads = [
      thread({
        id: "r",
        text: "Réguliers",
        note: "linge de lit · ~2sem · 2026-08-01",
      }),
    ];
    expect(
      upsertRegulierOps(threads, [
        { label: "linge de lit", cadence: "~2sem", lastDone: "2026-08-18" },
      ]),
    ).toEqual([]);
  });
});

describe("mergeRegulierWrites", () => {
  it("remplace un add greffier du conteneur par l'écriture code", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "linge de lit toutes les 2 semaines",
      },
    ];
    const merged = mergeRegulierWrites(
      [],
      messages,
      [{ op: "add", text: "Réguliers", kind: "action", note: "mal formé" }],
      at,
    );
    expect(merged).toEqual([
      {
        op: "add",
        text: "Réguliers",
        kind: "action",
        note: "linge de lit · ~2sem · 2026-08-04",
      },
    ]);
  });

  it("écarte l'add tâche du greffier au profit de Réguliers", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content:
          "tous les 4 mois, c'est super important que je fasse un bilan sanguin pour voir l'evolution santé",
      },
    ];
    const merged = mergeRegulierWrites(
      [],
      messages,
      [
        {
          op: "add",
          text: "Bilan sanguin tous les 4 mois — évolution santé",
          kind: "action",
        },
      ],
      at,
    );
    expect(
      merged.some(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          (o as { text?: string }).text !== "Réguliers" &&
          (o as { op?: string }).op === "add",
      ),
    ).toBe(false);
    expect(merged).toEqual([
      {
        op: "add",
        text: "Réguliers",
        kind: "action",
        note: "bilan sanguin · ~4mois · 2026-04-20",
      },
    ]);
  });
});
