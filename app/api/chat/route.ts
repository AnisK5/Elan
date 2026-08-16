import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Thread } from "@/lib/types";
import { ageLabel, dueLabel, intentionLabel } from "@/lib/thread-labels";
import { socle } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  messages: ChatMessage[];
  threads: Thread[];
  meta?: { name?: string };
}

function renderThreads(threads: Thread[]): string {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return "Aucun truc ouvert en ce moment.";
  const lines = open.map((t) => {
    const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
    const seen = t.touchedAt ? "" : " · jamais entamé";
    const note = t.note ? `\n    contexte : ${t.note}` : "";
    return `- [${kind}] ${t.text}${dueLabel(t.due)}${intentionLabel(t.plannedFor)}${ageLabel(t.createdAt, "déposé")}${seen}${note}`;
  });
  return `${open.length} trucs ouverts :\n${lines.join("\n")}`;
}

function systemPrompt(threads: Thread[], name?: string): string {
  return `${socle(name)}

OÙ TU ES : une discussion LIBRE, en dehors d'une séance. Pas de minuteur, pas de programme, pas de premier pas à arracher. Elle vient parler — donner des nouvelles, réfléchir à voix haute sur un truc, demander comment s'organiser demain, ou juste poser une question. Tu réponds, simplement.

CE QUE TU FAIS ICI :
- Quand elle demande comment s'organiser (demain, cette semaine), réponds EN CRÉNEAUX : combien, de quelle durée, à quel moment, et ce qu'on y mettrait. « Demain, je te proposerais un créneau de 30 min en matinée : on y attaquerait la relance de l'assurance, et s'il reste du temps on poserait la première pierre du kayak. » Reste clairsemé — un ou deux créneaux par jour, rarement plus — et dis pourquoi cet ordre.
- Si elle veut réfléchir à un truc, aide-la à le découper, à décider, ou à trouver la première phrase à écrire.
- Si elle donne des nouvelles (« j'ai appelé le dentiste »), accuse réception en une phrase et enchaîne naturellement. Ce qu'elle dit est enregistré automatiquement sur ses trucs — ne lui demande jamais de noter quoi que ce soit. Quand elle dit « demain matin on fait X », c'est retenu : tu peux le lui confirmer simplement.
- RÉGULIERS : si elle dit vouloir penser à quelque chose qui revient (loyer, URSSAF, draps, appeler quelqu'un…) — seulement si ELLE le demande — confirme que c'est retenu. Ne propose jamais une liste toute faite ; tu peux demander une fois s'il y a des trucs récurrents qu'elle oublie.

CE QUE TU NE FAIS PAS :
- Tu ne lances pas de séance et tu ne pousses pas au travail. Si ça s'y prête vraiment, glisse une fois « on peut en faire un créneau si tu veux », puis lâche.
- Tu ne culpabilises jamais, tu ne comptes pas les retards.

CE QU'ELLE A EN COURS :
${renderThreads(threads)}`;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Clé API manquante." },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { messages = [], threads = [], meta } = body;
  if (messages.length === 0) {
    return Response.json({ error: "Rien à dire." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 1000,
    system: systemPrompt(threads, meta?.name),
    // On ne garde que la fin de la discussion : au-delà, le contexte utile
    // vient des trucs eux-mêmes, pas du bavardage.
    messages: messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur de génération.";
        controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
