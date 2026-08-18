import { describe, expect, it } from "vitest";
import { splitChatQuestion } from "./chat-question";

describe("splitChatQuestion", () => {
  it("sépare la dernière question", () => {
    expect(
      splitChatQuestion("C'est rangé, relance Paul et le devis. On commence par lequel ?"),
    ).toEqual({
      body: "C'est rangé, relance Paul et le devis.",
      question: "On commence par lequel ?",
    });
  });

  it("laisse tel quel s'il n'y a pas de question", () => {
    expect(splitChatQuestion("Relance Paul, c'est noté.")).toEqual({
      body: "Relance Paul, c'est noté.",
      question: null,
    });
  });

  it("n'a que l'encart si le message est une question", () => {
    expect(splitChatQuestion("On se fait 15 min ?")).toEqual({
      body: "",
      question: "On se fait 15 min ?",
    });
  });

  it("ne prend que la dernière phrase interrogative", () => {
    expect(
      splitChatQuestion("C'est noté. Ça te va ? On se fait 15 min ?"),
    ).toEqual({
      body: "C'est noté. Ça te va ?",
      question: "On se fait 15 min ?",
    });
  });
});
