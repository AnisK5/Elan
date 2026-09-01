import type { AnthropicFailKind } from "./anthropic";

export interface AiUserFailCopy {
  message: string;
  showByokHint: boolean;
  showListHint: boolean;
}

const FEEDBACK_HINT =
  "Un retour dans Réglages ou ci-dessous suffit — je le lis à la main.";

/** Messages utilisateur quand l'IA est indisponible (crédits, quota). */
export function aiUserFailCopy(kind: AnthropicFailKind): AiUserFailCopy {
  if (kind === "credits") {
    return {
      message: `Élan est en pause technique — ta liste marche toujours. ${FEEDBACK_HINT}`,
      showByokHint: true,
      showListHint: true,
    };
  }
  if (kind === "quota") {
    return {
      message: `Tu as beaucoup utilisé Élan aujourd'hui — reprends demain. ${FEEDBACK_HINT}`,
      showByokHint: true,
      showListHint: true,
    };
  }
  if (kind === "auth") {
    return {
      message: "La clé Claude n'est pas reconnue. Vérifie-la dans Réglages.",
      showByokHint: false,
      showListHint: false,
    };
  }
  if (kind === "rate") {
    return {
      message: "Élan est un peu saturé — réessaie dans quelques secondes.",
      showByokHint: false,
      showListHint: false,
    };
  }
  return {
    message: "Élan n'a pas pu répondre. Réessaie dans un instant.",
    showByokHint: false,
    showListHint: false,
  };
}

export function aiUserFailMessage(kind: AnthropicFailKind): string {
  return aiUserFailCopy(kind).message;
}

export const BYOK_HINT =
  "Tu peux aussi coller ta clé Claude dans Réglages — tes séances passeront par ton compte Anthropic.";

export const LIST_HINT =
  "Tu peux quand même consulter tes trucs, déposer, ou terminer la séance.";
