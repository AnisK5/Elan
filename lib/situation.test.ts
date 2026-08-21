import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/types";
import {
  activeSituation,
  extractSituationFromConvo,
  parseReturnDate,
} from "./situation";

const at = new Date("2026-08-21T14:00:00.000+02:00");

describe("parseReturnDate", () => {
  it("prend le plus tardif de « 27 ou 28 août »", () => {
    expect(parseReturnDate("je reviens de vienne le 27 ou 28 aout", at)).toBe(
      "2026-08-28",
    );
  });

  it("ignore une date déjà passée", () => {
    expect(parseReturnDate("c'était le 12 août", at)).toBeNull();
  });
});

describe("extractSituationFromConvo", () => {
  it("écrit Vienne + le retour, sans snooze", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "actuellement, je suis à vienne, pas chez moi" },
      { role: "assistant", content: "dis-moi jusqu'à quand tu es en voyage" },
      { role: "user", content: "je reviens de vienne le 27 ou 28 aout" },
    ];
    expect(extractSituationFromConvo(messages, at)).toEqual({
      text: "À Vienne, pas chez soi. Retour le 28/08/2026.",
      until: "2026-08-28",
    });
  });

  it("ne prend pas un voyage prévu (Asie) pour une absence", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "jeter un œil aux billets pour l'Asie du Sud-Est" },
    ];
    expect(extractSituationFromConvo(messages, at)).toBeNull();
  });
});

describe("activeSituation", () => {
  it("expire le lendemain du retour", () => {
    expect(
      activeSituation(
        { text: "À Vienne.", until: "2026-08-20" },
        at,
      ),
    ).toBeNull();
  });

  it("reste vrai tant que le retour est aujourd'hui ou plus tard", () => {
    expect(
      activeSituation({ text: "À Vienne.", until: "2026-08-21" }, at)?.text,
    ).toBe("À Vienne.");
  });
});
