import { describe, expect, it } from "vitest";
import { buildRitualNotification, compressPlanLine, isNotifyTimeNow } from "./notifications";

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
    expect(n.body).toContain("Tap pour lancer");
    expect(n.body).toContain("ajuster");
    expect(n.body.length).toBeLessThanOrEqual(220);
  });

  it("backlog vide sans culpabilité", () => {
    const n = buildRitualNotification({
      minutes: 5,
      planMessage: "",
      openCount: 0,
    });
    expect(n.title).toBe("Élan · 5 min");
    expect(n.body).toContain("Rien qui presse");
  });
});

describe("isNotifyTimeNow", () => {
  it("matche l'heure exacte", () => {
    const at = new Date(2026, 7, 12, 9, 0, 30);
    expect(isNotifyTimeNow("09:00", "Europe/Paris", at)).toBe(true);
    expect(isNotifyTimeNow("09:01", "Europe/Paris", at)).toBe(false);
  });
});
