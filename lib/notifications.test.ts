import { describe, expect, it } from "vitest";
import {
  buildRitualNotification,
  buildOfflinePlanHint,
  compressPlanLine,
  isNotifyTimeNow,
  polishNotifyMessage,
} from "./notifications";

describe("compressPlanLine", () => {
  it("garde une phrase courte intacte", () => {
    expect(compressPlanLine("Relance Paul et le dentiste.", 80)).toBe(
      "Relance Paul et le dentiste.",
    );
  });

  it("tronque avec ellipse", () => {
    const long =
      "Deux relances traînent dont une pour vendredi je te propose de commencer par l'assurance avec un brouillon mail prêt";
    const out = compressPlanLine(long, 60);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildRitualNotification", () => {
  it("inclut durée et conseil compressé", () => {
    const n = buildRitualNotification({
      minutes: 30,
      planMessage:
        "Relance Paul et le dentiste — je prépare le brouillon pour l'assurance.",
      openCount: 2,
    });
    expect(n.title).toBe("Élan · 30 min");
    expect(n.body).toContain("Relance");
    expect(n.body).toContain("Ouvre quand tu veux");
    expect(n.pick).toBe("30");
    expect(n.planMessage).toContain("Relance");
    expect(n.body.length).toBeLessThanOrEqual(200);
  });

  it("retire la durée redondante du corps", () => {
    const n = buildRitualNotification({
      minutes: 30,
      planMessage:
        "Je te propose 30 min aujourd'hui — planification voyage, j'ai une idée.",
      openCount: 3,
    });
    expect(n.body).not.toMatch(/30 min/i);
    expect(n.body).toContain("planification voyage");
  });

  it("backlog vide, ton léger", () => {
    const n = buildRitualNotification({
      minutes: 5,
      planMessage: "",
      openCount: 0,
    });
    expect(n.title).toBe("Élan · 5 min");
    expect(n.body).toContain("Rien qui presse");
    expect(n.body).not.toContain("Tap pour");
  });

  it("sans conseil LLM, pas de compteur anxiogène", () => {
    const n = buildRitualNotification({
      minutes: 15,
      planMessage: "",
      openCount: 23,
    });
    expect(n.body).not.toContain("23 truc");
    expect(n.body).toContain("créneau");
  });
});

describe("polishNotifyMessage", () => {
  it("enlève je te propose X min", () => {
    expect(
      polishNotifyMessage("Je te propose 30 min — relance Paul."),
    ).toBe("relance Paul.");
  });
});

describe("buildOfflinePlanHint", () => {
  it("cite un truc concret sans répéter la durée", () => {
    const hint = buildOfflinePlanHint([
      {
        id: "1",
        text: "Relancer Paul pour le devis",
        kind: "action",
        status: "open",
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(hint.message).toContain("Relancer Paul");
    expect(hint.message).not.toContain("15 min");
    expect(hint.message).toContain("on s'y met");
  });
});

describe("isNotifyTimeNow", () => {
  it("matche l'heure exacte", () => {
    const at = new Date(2026, 7, 12, 9, 0, 30);
    expect(isNotifyTimeNow("09:00", "Europe/Paris", at)).toBe(true);
    expect(isNotifyTimeNow("09:01", "Europe/Paris", at)).toBe(false);
  });
});
