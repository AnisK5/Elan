import { describe, expect, it } from "vitest";
import { OUTDOOR_DURATION } from "./constants";
import { buildRitualLaunchUrl, parseRitualLaunch } from "./ritual-pending";

describe("parseRitualLaunch", () => {
  it("ouvre une Sortie depuis le pick notif", () => {
    const path = buildRitualLaunchUrl(
      "sortie",
      "Imprimer le doc de ton père à la papeterie.",
    );
    const search = path.startsWith("/?") ? path.slice(1) : path;
    const launch = parseRitualLaunch(search);
    expect(launch).toEqual({
      pick: OUTDOOR_DURATION,
      message: "Imprimer le doc de ton père à la papeterie.",
      context: "sortie",
    });
  });

  it("garde une durée bureau", () => {
    const launch = parseRitualLaunch("?ritual=1&pick=15&msg=Relance%20Laura");
    expect(launch).toEqual({ pick: 15, message: "Relance Laura" });
  });
});
