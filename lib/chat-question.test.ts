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

  it("raccourcit une question trop longue sur le dernier tiret", () => {
    expect(
      splitChatQuestion(
        "On relance l'impression. Le tout petit premier pas, là maintenant, c'est juste de vérifier que tu as bien le fichier sous la main dans ta boîte mail — tu le retrouves ?",
      ),
    ).toEqual({
      body: "On relance l'impression. Le tout petit premier pas, là maintenant, c'est juste de vérifier que tu as bien le fichier sous la main dans ta boîte mail.",
      point: "Tu le retrouves ?",
    });
  });

  it("n'envoie pas une question encore trop longue dans l'encart", () => {
    const long =
      "On relance Laura. Le tout premier pas, c'est juste de retrouver son contact ou notre dernier échange ; tu veux que je te prépare le message pendant que tu ouvres la conversation ?";
    expect(splitChatQuestion(long)).toEqual({
      body: long,
      point: null,
    });
  });
});
