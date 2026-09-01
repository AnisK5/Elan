import { describe, expect, it } from "vitest";
import { firstName, greeting, welcomeLine } from "./Branding";

describe("Branding", () => {
  it("extrait le prénom", () => {
    expect(firstName("Anis Krari")).toBe("Anis");
    expect(firstName("  ")).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });

  it("ajoute le prénom au salut quand dispo", () => {
    expect(greeting("Thomas")).toMatch(/Thomas/);
    expect(greeting()).not.toMatch(/,/);
  });

  it("personnalise l'accueil newcomer", () => {
    expect(welcomeLine("Marie")).toBe("Bienvenue, Marie 👋");
    expect(welcomeLine()).toBe("Bienvenue 👋");
  });
});
