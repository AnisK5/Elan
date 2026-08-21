import { describe, expect, it } from "vitest";
import {
  sessionBodyFromBrief,
  sessionOpeningFromBrief,
} from "./session-opening";

describe("sessionOpeningFromBrief", () => {
  it("reprend le pas du créneau sans re-proposer la durée", () => {
    expect(
      sessionBodyFromBrief(
        "Je te propose un créneau de 15 min, pour que l'on relance Laura en un message.",
      ),
    ).toBe("On relance Laura en un message.");
    expect(
      sessionOpeningFromBrief(
        "Pour ce créneau de 15 min, je propose que l'on relance Laura en un message.",
      ),
    ).toBe(
      "Salut, content de te retrouver. On relance Laura en un message. On s'y met ?",
    );
  });

  it("reprend une Sortie sans re-proposer le bouton", () => {
    expect(
      sessionBodyFromBrief(
        "Je te propose une Sortie, pour imprimer le doc de ton père à la papeterie.",
      ),
    ).toBe("Imprimer le doc de ton père à la papeterie.");
  });

  it("garde un brief de notif tel quel", () => {
    expect(
      sessionOpeningFromBrief("Relance Laura — je prépare le brouillon mail."),
    ).toBe(
      "Salut, content de te retrouver. Relance Laura — je prépare le brouillon mail. On s'y met ?",
    );
  });

  it("ne double pas un salut déjà là", () => {
    expect(sessionOpeningFromBrief("Salut, on relance Laura.")).toBe(
      "Salut, on relance Laura. On s'y met ?",
    );
  });
});
