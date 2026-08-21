import { describe, expect, it } from "vitest";
import {
  extractPlanFromContent,
  parsePlanJson,
  planFromUnknown,
} from "./plan-json";

describe("parsePlanJson", () => {
  it("lit un objet complet", () => {
    expect(
      parsePlanJson(
        '{"message":"Je te propose un créneau de 15 min, pour un rappel à ton père.","pick":"15"}',
      ),
    ).toMatchObject({ pick: "15" });
  });

  it("rattrape message et pick si le reste est coupé", () => {
    const truncated =
      '{"message":"Je te propose un créneau de 5 min, pour un rappel à ton père.","pick":"5","why":"1) Vienne ';
    const parsed = parsePlanJson(truncated);
    expect(parsed?.pick).toBe("5");
    expect(parsed?.message).toContain("rappel");
  });

  it("ignore le markdown autour", () => {
    const parsed = parsePlanJson(
      '```json\n{"message":"Rien qui presse.","pick":"5"}\n```',
    );
    expect(parsed).toEqual({ message: "Rien qui presse.", pick: "5" });
  });
});

describe("extractPlanFromContent", () => {
  it("prend l'outil forcé avant le texte", () => {
    const plan = extractPlanFromContent([
      { type: "text", text: "ignore moi" },
      {
        type: "tool_use",
        name: "conseil_du_jour",
        input: {
          message: "Je te propose un créneau de 15 min, pour un rappel.",
          pick: "15",
        },
      },
    ]);
    expect(plan?.pick).toBe("15");
    expect(plan?.message).toContain("rappel");
  });

  it("retombe sur le JSON texte", () => {
    const plan = extractPlanFromContent([
      {
        type: "text",
        text: '{"message":"Rien qui presse.","pick":"5"}',
      },
    ]);
    expect(plan).toEqual({ message: "Rien qui presse.", pick: "5" });
  });
});

describe("planFromUnknown", () => {
  it("refuse un message vide", () => {
    expect(planFromUnknown({ message: "  ", pick: "15" })).toBeNull();
  });
});
