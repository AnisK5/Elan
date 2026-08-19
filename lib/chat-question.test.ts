import { describe, expect, it } from "vitest";
import { splitChatQuestion } from "./chat-question";

describe("splitChatQuestion", () => {
  it("sépare la dernière question", () => {
    expect(
      splitChatQuestion("C'est rangé, relance Paul et le devis. On commence par lequel ?"),
    ).toEqual({
      body: "C'est rangé, relance Paul et le devis.",
      point: "On commence par lequel ?",
    });
  });

  it("laisse une seule phrase non interrogative dans le corps", () => {
    expect(splitChatQuestion("Relance Paul, c'est noté.")).toEqual({
      body: "Relance Paul, c'est noté.",
      point: null,
    });
  });

  it("garde le paragraphe entier s'il n'y a pas de question", () => {
    expect(
      splitChatQuestion(
        "Il est tôt, 15 min suffisent. Le linge de lit — le mettre en machine, trois minutes.",
      ),
    ).toEqual({
      body: "Il est tôt, 15 min suffisent. Le linge de lit — le mettre en machine, trois minutes.",
      point: null,
    });
  });

  it("n'a que l'encart si le message est une question", () => {
    expect(splitChatQuestion("On se fait 15 min ?")).toEqual({
      body: "",
      point: "On se fait 15 min ?",
    });
  });

  it("ne prend que la dernière phrase", () => {
    expect(
      splitChatQuestion("C'est noté. Ça te va ? On se fait 15 min ?"),
    ).toEqual({
      body: "C'est noté. Ça te va ?",
      point: "On se fait 15 min ?",
    });
  });
});
