/** Conseil du jour — lecture fiable, même si le modèle coupe ou entoure. */

export const PLAN_PICKS = ["5", "15", "30", "50", "sortie"] as const;
export type PlanPick = (typeof PLAN_PICKS)[number];

export type PlanJson = { message: string; pick: string; why?: string; review?: string };

export const CONSEIL_TOOL_NAME = "conseil_du_jour";

/**
 * Force un JSON {why, review, message, pick}.
 * why + review EN PREMIER : arbitrage puis relecture invisible avant le conseil visible.
 */
export const CONSEIL_TOOL = {
  name: CONSEIL_TOOL_NAME,
  description:
    "Le conseil du jour. Ordre strict : why (6 points), review (relecture invisible), puis message et pick alignés.",
  input_schema: {
    type: "object" as const,
    properties: {
      why: {
        type: "string",
        description:
          "Les 6 points d'ARBITRAGE SILENCIEUX, une phrase courte chacun, numérotés 1) à 6). Factuel, pour le développeur. JAMAIS repris dans message.",
      },
      review: {
        type: "string",
        description:
          "Relecture INVISIBLE (jamais dans message). Réponds en 1–3 phrases à : « Un pas ou une question serait-il mal calé — condition déjà tranchée (à acheter, pas dispo, relancé récemment), mauvais lieu, relance reportée, question absurde (ex. patins déjà là alors qu'il faut les acheter) ? » Si oui, dis ce que tu corriges. Sinon « OK » + une phrase. message et pick DOIVENT suivre.",
      },
      message: {
        type: "string",
        description:
          "2 à 4 phrases, françaises, sans markdown. La conclusion seulement — en cohérence avec why et review.",
      },
      pick: {
        type: "string",
        enum: [...PLAN_PICKS],
        description: "Durée du créneau, ou sortie. Doit suivre why et review.",
      },
    },
    required: ["why", "review", "message", "pick"],
  },
};

export const PHRASE_TOOL_NAME = "conseil_duree";

/**
 * Message + pick seuls — recalage de durée (why déjà tranché), outdoor, notif.
 * Pas d'arbitrage écrit ici : le why du jour reste celui du premier conseil desk.
 */
export const PHRASE_TOOL = {
  name: PHRASE_TOOL_NAME,
  description:
    "Le conseil à l'écran : la phrase visible et la durée (ou sortie). Pas d'arbitrage écrit.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description:
          "2 à 4 phrases, françaises, sans markdown. La conclusion seulement.",
      },
      pick: {
        type: "string",
        enum: [...PLAN_PICKS],
        description: "Durée du créneau, ou sortie.",
      },
    },
    required: ["message", "pick"],
  },
};

export function parsePlanJson(text: string): PlanJson | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const blob = start >= 0 ? cleaned.slice(start) : cleaned;

  try {
    return planFromUnknown(JSON.parse(blob));
  } catch {
    // JSON coupé : on rattrape message + pick s'ils sont déjà là.
  }

  const msg = blob.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const pick = blob.match(/"pick"\s*:\s*"(5|15|30|50|sortie)"/);
  if (!msg || !pick) return null;
  const why = blob.match(/"why"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const review = blob.match(/"review"\s*:\s*"((?:\\.|[^"\\])*)"/);
  return {
    message: unquote(msg[1]),
    pick: pick[1],
    why: why ? unquote(why[1]).trim() : undefined,
    review: review ? unquote(review[1]).trim() : undefined,
  };
}

export function planFromUnknown(input: unknown): PlanJson | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.message !== "string" || typeof o.pick !== "string") return null;
  if (!o.message.trim()) return null;
  return {
    message: o.message,
    pick: o.pick,
    why: typeof o.why === "string" ? o.why.trim() : undefined,
    review: typeof o.review === "string" ? o.review.trim() : undefined,
  };
}

/** Prefère l'appel d'outil forcé ; sinon le JSON dans le texte. */
export function extractPlanFromContent(
  content: ReadonlyArray<{
    type: string;
    name?: string;
    input?: unknown;
    text?: string;
  }>,
): PlanJson | null {
  for (const b of content) {
    if (
      b.type === "tool_use" &&
      (b.name === CONSEIL_TOOL_NAME || b.name === PHRASE_TOOL_NAME)
    ) {
      const plan = planFromUnknown(b.input);
      if (plan) return plan;
    }
  }
  const text = content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
  return text ? parsePlanJson(text) : null;
}

function unquote(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}
