import { describe, expect, it } from "vitest";
import { buildRitualEmail } from "./ritual-email";

describe("buildRitualEmail", () => {
  it("inclut le conseil complet et la durée", () => {
    const { subject, text } = buildRitualEmail({
      name: "Anis",
      minutes: 30,
      planMessage:
        "Je te propose 30 min — relance Paul et on prépare le mail pour l'assurance.",
    });
    expect(subject).toContain("30 min");
    expect(text).toContain("relance Paul");
    expect(text).toContain("Bonjour Anis");
  });
});
