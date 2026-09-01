import type { AnthropicFailKind } from "./anthropic";

export interface AiUserFailCopy {
  message: string;
  showByokHint: boolean;
  showListHint: boolean;
}

const FEEDBACK_HINT =
  "Contact dans Réglages ou ci-dessous — un mot suffit, on le lit.";

/** Messages utilisateur quand l'IA est indisponible (crédits, quota). */
export function aiUserFailCopy(kind: AnthropicFailKind): AiUserFailCopy {
  if (kind === "credits") {
    return {
      message: `Crédits Anthropic épuisés sur la clé de l'app — ta liste marche toujours. ${FEEDBACK_HINT}`,
      showByokHint: true,
      showListHint: true,
    };
  }
  if (kind === "quota") {
    return {
      message: `Plafond du jour atteint sur la clé partagée — ce n'est pas un rechargement Anthropic. Reprends demain, ou augmente la limite admin. ${FEEDBACK_HINT}`,
      showByokHint: true,
      showListHint: true,
    };
  }
  if (kind === "no_key") {
    return {
      message: `Élan n'a pas de clé API côté serveur — la liste marche toujours. ${FEEDBACK_HINT}`,
      showByokHint: false,
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
