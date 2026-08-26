import { describe, expect, it } from "vitest";
import {
  hasRecentContactNote,
  hasFutureSoftTiming,
  hasUnverifiedCondition,
  isDeskPlanCandidate,
  isOutdoorNeed,
  isRelanceStyleText,
  splitDeskBuckets,
  splitPlanThreads,
} from "./plan-candidates";
import type { Thread } from "./types";

function thread(partial: Partial<Thread> & { text: string }): Thread {
  return {
    id: partial.id ?? "t1",
    text: partial.text,
    kind: partial.kind ?? "action",
    status: partial.status ?? "open",
    createdAt: partial.createdAt ?? new Date().toISOString(),
    due: partial.due,
    note: partial.note,
    touchedAt: partial.touchedAt,
    effort: partial.effort,
    plannedFor: partial.plannedFor,
  };
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function frToday(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("hasRecentContactNote", () => {
  it("détecte un contact daté aujourd'hui", () => {
    expect(
      hasRecentContactNote(`relancé le ${frToday()}, en attente de réponse`),
    ).toBe(true);
  });

  it("détecte envoyé + aujourd'hui en clair", () => {
    expect(hasRecentContactNote("envoyé aujourd'hui, en attente")).toBe(true);
  });

  it("ignore un contact vieux", () => {
    expect(hasRecentContactNote("relancé le 03/01/2020, en attente")).toBe(
      false,
    );
  });

  it("ignore une note sans contact", () => {
    expect(hasRecentContactNote("papa attend ça depuis mars")).toBe(false);
  });
});

describe("isDeskPlanCandidate — cas Claire", () => {
  it("exclut un suivi dont la prochaine relance est dans 12j", () => {
    const t = thread({
      text: "relancer Claire",
      kind: "suivi",
      due: daysFromNow(12),
      note: "relancé le 01/01, en attente",
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("exclut une action « relancer » avec due future (trop tôt)", () => {
    const t = thread({
      text: "relancer Claire",
      kind: "action",
      due: daysFromNow(12),
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("exclut un fil contacté ce matin (note)", () => {
    const t = thread({
      text: "relancer Claire",
      kind: "suivi",
      due: daysFromNow(7),
      note: `relancé le ${frToday()}, en attente de réponse`,
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("garde une relance dont le délai est passé", () => {
    const t = thread({
      text: "relancer Claire",
      kind: "suivi",
      due: daysFromNow(-1),
    });
    expect(isDeskPlanCandidate(t)).toBe(true);
  });

  it("garde une action avec fenêtre externe future (pas une relance)", () => {
    const t = thread({
      text: "déclaration URSSAF",
      kind: "action",
      due: daysFromNow(12),
    });
    expect(isDeskPlanCandidate(t)).toBe(true);
  });

  it("isRelanceStyleText reconnaît les libellés de contact", () => {
    expect(isRelanceStyleText("relancer Claire")).toBe(true);
    expect(isRelanceStyleText("prendre des nouvelles de Paul")).toBe(true);
    expect(isRelanceStyleText("envoyer le devis à Paul")).toBe(false);
    expect(isRelanceStyleText("déclaration URSSAF")).toBe(false);
  });

  it("exclut « vers le 1er septembre » même sans année dans la note", () => {
    const t = thread({
      text: "MP LinkedIn à Claire Ducreux (Saegus)",
      kind: "action",
      due: daysFromNow(8),
      note: "Claire Ducreux, contact Saegus sur LinkedIn. À faire vers le 1er septembre.",
    });
    expect(hasFutureSoftTiming(t.note)).toBe(true);
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("exclut Claire « à faire vers le 1er septembre » (timing doux)", () => {
    const t = thread({
      text: "MP LinkedIn à Claire Ducreux (Saegus)",
      kind: "action",
      due: daysFromNow(11),
      note: "Claire Ducreux, contact Saegus sur LinkedIn. À faire vers le 1er septembre 2026.",
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("exclut « à partir du 30/08 » même sans due", () => {
    const t = thread({
      text: "Appeler Orange pour éligibilité fibre",
      kind: "action",
      note: "À faire à partir du lundi 30/08/2026 (en semaine uniquement).",
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });

  it("exclut plannedFor encore dans le futur", () => {
    const t = thread({
      text: "organiser le kayak",
      kind: "action",
      plannedFor: daysFromNow(3),
    });
    expect(isDeskPlanCandidate(t)).toBe(false);
  });
});

describe("splitPlanThreads", () => {
  it("sépare candidats et en attente", () => {
    const claire = thread({
      id: "c",
      text: "relancer Claire",
      kind: "suivi",
      due: daysFromNow(12),
    });
    const linge = thread({
      id: "l",
      text: "mettre le linge",
      kind: "action",
    });
    const { candidates, waiting } = splitPlanThreads([claire, linge]);
    expect(candidates.map((t) => t.id)).toEqual(["l"]);
    expect(waiting.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("sorties et conditions jamais posées", () => {
  it("repère une sortie magasin / coffre / nager", () => {
    expect(
      isOutdoorNeed(
        thread({ text: "Faire du shopping chaussures", note: "Avec mon bon d'achat" }),
      ),
    ).toBe(true);
    expect(
      isOutdoorNeed(
        thread({
          text: "Rendre argent au coffre",
          note: "À faire dès réception du salaire. Nécessite un déplacement en journée.",
        }),
      ),
    ).toBe(true);
    expect(
      isOutdoorNeed(
        thread({ text: "Nager dans la Seine à Paris (en face de chez moi)" }),
      ),
    ).toBe(true);
  });

  it("n'invente pas une sortie si papa imprime lui-même", () => {
    expect(
      isOutdoorNeed(
        thread({
          text: "Imprimer le doc de papa",
          note: "Papa prend en charge l'impression lui-même. Plus de sortie papeterie nécessaire.",
        }),
      ),
    ).toBe(false);
  });

  it("repère une condition jamais posée", () => {
    expect(
      hasUnverifiedCondition(
        thread({
          text: "Changer les patins des chaises",
          note: "À vérifier : patins déjà disponibles ou à acheter.",
        }),
      ),
    ).toBe(true);
    expect(
      hasUnverifiedCondition(
        thread({ text: "mettre le linge", note: "dans le bac" }),
      ),
    ).toBe(false);
  });

  it("sépare bureau / sortie / condition", () => {
    const linge = thread({ id: "l", text: "mettre le linge" });
    const chaussures = thread({
      id: "s",
      text: "Faire du shopping chaussures",
    });
    const patins = thread({
      id: "p",
      text: "Changer les patins des chaises",
      note: "À vérifier : patins déjà disponibles ou à acheter.",
    });
    const { sitting, outdoor, conditions } = splitDeskBuckets([
      linge,
      chaussures,
      patins,
    ]);
    expect(sitting.map((t) => t.id)).toEqual(["l"]);
    expect(outdoor.map((t) => t.id)).toEqual(["s"]);
    expect(conditions.map((t) => t.id)).toEqual(["p"]);
  });
});
