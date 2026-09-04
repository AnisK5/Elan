/** Conseil du jour — lecture fiable, même si le modèle coupe ou entoure. */

export const PLAN_PICKS = ["5", "15", "30", "50", "sortie"] as const;
export type PlanPick = (typeof PLAN_PICKS)[number];

export type PlanMomentJson = {
  label: string;
  mode?: "desk" | "sortie" | "courses" | "regulier";
  /** Durée proposée (peut être 25 — accrochée au bouton le plus proche). */
  mins?: number;
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
    "Carte du jour. Ordre : why, review, moments, pick, message (légende fidèle des moments).",
  input_schema: {
    type: "object" as const,
    properties: {
      why: {
        type: "string",
        description:
          "Les 6 points d'ARBITRAGE SILENCIEUX, une phrase courte chacun, numérotés 1) à 6). Point 3 = mix couverture. Point 5 = « déborde ? NON — parce que … » (fenêtres + un tour de mix). JAMAIS repris dans message.",
      },
      review: {
        type: "string",
        description:
          "Relecture INVISIBLE (jamais dans message). Réponds en 1–3 phrases à : « Pas mal calé ? Mix couverture tenu ? Capacité ≥ fenêtres ? Pas saucissonné un gros bloc ? » Si oui, dis ce que tu corriges. Sinon « OK » + une phrase. message, pick et moments DOIVENT suivre.",
      },
      message: {
        type: "string",
        description:
          "UNE phrase, écrite en dernier, qui décrit UNIQUEMENT les moments : même nombre, mêmes sujets. Interdit d'annoncer un linge / une séance absente de moments. Français, sans markdown.",
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
          "1 à 3 séances du jour (= bullets). Chaque objet = une séance : label court + mins (durée). Capacité totale doit couvrir les fenêtres du jour. Le détail vit dans la séance, pas ici.",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Titre court SANS durée (ex. « Message à papa + PS », « Linge de lit »). Max ~50 car.",
            },
            mins: {
              type: "number",
              description:
                "Durée proposée en minutes (5–50). Obligatoire pour desk / regulier. Ex. 25.",
            },
            mode: {
              type: "string",
              enum: ["desk", "sortie", "courses", "regulier"],
              description:
                "desk ou regulier = séance bureau ; sortie / courses = hors bureau",
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
  for (const item of raw.slice(0, 3)) {
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
    const mins =
      typeof o.mins === "number" && o.mins > 0 ? Math.round(o.mins) : undefined;
    out.push({
      label: o.label.trim().slice(0, 80),
      ...(mode ? { mode } : {}),
      ...(mins != null ? { mins } : {}),
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
