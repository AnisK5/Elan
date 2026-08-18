import { describe, expect, it } from "vitest";
import { splitChatQuestion } from "./chat-question";

describe("splitChatQuestion", () => {
  it("sépare la question finale", () => {
    expect(
      splitChatQuestion("C'est noté, je le porte. C'est pour quand ?"),
    ).toEqual({
      body: "C'est noté, je le porte.",
      question: "C'est pour quand ?",
    });
  });

  it("laisse un texte sans question", () => {
    expect(splitChatQuestion("C'est noté, je le porte.")).toEqual({
      body: "C'est noté, je le porte.",
      question: null,
    });
  });

  it("si tout est une question, pas de corps", () => {
    expect(splitChatQuestion("Tu veux qu'on en fasse un créneau ?")).toEqual({
      body: "",
      question: "Tu veux qu'on en fasse un créneau ?",
    });
  });
});
