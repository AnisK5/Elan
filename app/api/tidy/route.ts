import Anthropic from "@anthropic-ai/sdk";
import { resolveAiAccess } from "@/lib/ai-access";
import { classifyAnthropicError } from "@/lib/anthropic";
import { recordMessageUsage } from "@/lib/api-usage";
import { resolveUtilityModel } from "@/lib/models";
import { cachedSystemBlock } from "@/lib/prompt-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  text: string;
}

const SYSTEM = `Tu reçois UN truc que la personne vient de noter dans son app — parfois en vrac, en une phrase longue, avec du contexte ou de l'émotion.

Ton seul job : le rendre lisible sans rien perdre.
- Si le texte est VERBEUX (une phrase entière, du blabla, plus d'une poignée de mots) : produis un TITRE court et clair qui capte l'action essentielle (idéalement 2 à 6 mots, à l'infinitif si c'est une action), et mets la formulation d'origine (nettoyée, mais fidèle) dans "note" pour garder tout le détail et le contexte.
- Si le texte est DÉJÀ un titre court et clair (quelques mots) : renvoie-le tel quel dans "title", et "note" à null. Ne réécris pas pour réécrire.
- N'invente rien, n'ajoute aucune info absente. Reste fidèle aux mots de la personne.

Réponds UNIQUEMENT avec un objet JSON, rien d'autre :
{"title": "...", "note": "..." }   (note peut être null)`;

function safeParse(text: string): { title: string; note: string | null } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (typeof o.title === "string" && o.title.trim()) {
      return {
        title: o.title.trim(),
        note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function POST(req: Request) {
  const access = await resolveAiAccess(req);
  if (!access.apiKey || access.blocked) {
    return Response.json({ title: null, note: null });
  }
  const apiKey = access.apiKey;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ title: null, note: null });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ title: null, note: null });

  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  try {
    const res = await client.messages.create({
      model: resolveUtilityModel(),
      max_tokens: 400,
      system: cachedSystemBlock(SYSTEM),
      messages: [{ role: "user", content: text }],
    });
    void recordMessageUsage(
      req,
      res,
      { route: "tidy", exchangeKind: "tidy" },
      startedAt,
    );
    const block = res.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = safeParse(raw);
    if (!parsed) return Response.json({ title: null, note: null });
    return Response.json(parsed);
  } catch {
    return Response.json({ title: null, note: null });
  }
}
