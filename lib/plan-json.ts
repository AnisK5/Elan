/** Conseil du jour — lecture fiable, même si le modèle coupe ou entoure. */

export const PLAN_PICKS = ["5", "15", "30", "50", "sortie"] as const;
export type PlanPick = (typeof PLAN_PICKS)[number];

export type PlanMomentJson = {
  label: string;
  mode?: "desk" | "sortie" | "courses" | "regulier";
  match?: string;
};

export type PlanJson = {
  message: string;
  pick: string;
  why?: string;
  review?: string;
  moments?: PlanMomentJson[];
};

export const CONSEIL_TOOL_NAME = "conseil_du_jour";

/**
 * Force un JSON {why, review, message, pick, moments?}.
 * why + review EN PREMIER : arbitrage puis relecture invisible avant le conseil visible.
 */
export const CONSEIL_TOOL = {
  name: CONSEIL_TOOL_NAME,
  description:
    "Carte du jour. Ordre : why (6 points), review, message (forme de la journée), pick (suggestion pour lancer MAINTENANT), moments (1–2).",
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
          "Relecture INVISIBLE (jamais dans message). Réponds en 1–3 phrases à : « Un pas ou une question serait-il mal calé — condition déjà tranchée (à acheter, pas dispo, relancé récemment), mauvais lieu, relance reportée, question absurde ? » Si oui, dis ce que tu corriges. Sinon « OK » + une phrase. message, pick et moments DOIVENT suivre.",
      },
      message: {
        type: "string",
        description:
          "2 à 4 phrases : la FORME de la journée (1 ou 2 moments), pas un texte collé au seul bouton. Français, sans markdown.",
      },
      pick: {
        type: "string",
        enum: [...PLAN_PICKS],
        description:
          "Suggestion pour le PROCHAIN lancement (bouton). Pas toute la journée — juste par où commencer maintenant.",
      },
      moments: {
        type: "array",
        description:
          "1 ou 2 moments du jour. Si 2 : natures différentes (ex. urgent desk + régulier, ou desk + sortie).",
        minItems: 1,
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Court : « Relancer Laura », « Loyer (Régulier) ».",
            },
            mode: {
              type: "string",
              enum: ["desk", "sortie", "courses", "regulier"],
            },
            match: {
              type: "string",
              description:
                "Sous-chaîne du truc pour marquer fait (ex. Laura, loyer).",
            },
          },
          required: ["label"],
        },
      },
    },
    required: ["why", "review", "message", "pick", "moments"],
  },
};

export const PHRASE_TOOL_NAME = "conseil_duree";

/**
 * Message + pick seuls — outdoor, notif, modes spécialisés.
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

function parseMomentsJson(raw: unknown): PlanMomentJson[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PlanMomentJson[] = [];
  for (const item of raw.slice(0, 2)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.label !== "string" || !o.label.trim()) continue;
    const mode =
      o.mode === "desk" ||
      o.mode === "sortie" ||
      o.mode === "courses" ||
      o.mode === "regulier"
        ? o.mode
        : undefined;
    out.push({
      label: o.label.trim().slice(0, 80),
      ...(mode ? { mode } : {}),
      ...(typeof o.match === "string" && o.match.trim()
        ? { match: o.match.trim().slice(0, 80) }
        : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

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
  const moments = parseMomentsJson(o.moments);
  return {
    message: o.message,
    pick: o.pick,
    why: typeof o.why === "string" ? o.why.trim() : undefined,
    review: typeof o.review === "string" ? o.review.trim() : undefined,
    ...(moments ? { moments } : {}),
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
