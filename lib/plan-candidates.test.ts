import { describe, expect, it } from "vitest";
import {
  hasRecentContactNote,
  isDeskPlanCandidate,
  isRelanceStyleText,
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
