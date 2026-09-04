import { describe, expect, it } from "vitest";
import { mergeNoteTexts } from "./note-merge";

const ASIE = `Dates, destinations et budget calés. Prochaine étape : choisir le billet, valider avec les proches, puis réserver. Objectif initial : bloquer un billet avant septembre 2026. · Billet Paris–Bangkok acheté (A/R 15–27 déc 2026). Prochaine étape : réserver les hébergements étape par étape pour lock les prix. · Billet A/R Paris–Bangkok acheté (15–27 déc 2026). Prochaine étape : réserver les hébergements étape par étape pour lock les prix.`;

describe("mergeNoteTexts", () => {
  it("retire « À vérifier » quand la réponse arrive", () => {
    expect(
      mergeNoteTexts(
        "À faire vite. À vérifier : patins déjà là ou à acheter.",
        "Patins à acheter — pas encore disponible · listé sur Courses",
      ),
    ).toBe(
      "À faire vite. · Patins à acheter — pas encore disponible · listé sur Courses",
    );
  });

  it("n'empile pas deux prochaines étapes ni un billet déjà acheté", () => {
    const merged = mergeNoteTexts(ASIE, ASIE);
    expect(merged.match(/Prochaine étape/gi)?.length ?? 0).toBe(1);
    expect(merged.match(/Billet/gi)?.length ?? 0).toBe(1);
    expect(merged).not.toMatch(/Objectif initial/i);
    expect(merged).not.toMatch(/choisir le billet/i);
    expect(merged).toMatch(/Dates, destinations et budget calés/);
    expect(merged).toMatch(/Billet Paris–Bangkok acheté/);
    expect(merged).toMatch(/réserver les hébergements/i);
  });

  it("écarte la prochaine étape une fois l'hébergement réservé", () => {
    const cleaned = mergeNoteTexts(ASIE, ASIE);
    const after = mergeNoteTexts(
      cleaned,
      "Hébergements Asie du Sud-Est réservés (étape par étape).",
    );
    expect(after).not.toMatch(/Prochaine étape/i);
    expect(after).toMatch(/réservés/i);
    expect(after).toMatch(/Billet Paris–Bangkok acheté/);
  });

  it("garde les courses en liste sans les écraser", () => {
    expect(mergeNoteTexts("lait · pain", "oeufs")).toBe("lait · pain · oeufs");
  });
});
