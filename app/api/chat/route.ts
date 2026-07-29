import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Thread } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  messages: ChatMessage[];
  threads: Thread[];
  meta?: { name?: string };
}

function dayDiff(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function dueLabel(iso?: string): string {
  if (!iso) return "";
  const n = dayDiff(iso);
  if (n < 0) return ` · date passée depuis ${-n}j`;
  if (n === 0) return " · c'est aujourd'hui";
  if (n === 1) return " · c'est demain";
  return ` · dans ${n}j`;
}

function renderThreads(threads: Thread[]): string {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return "Aucun truc ouvert en ce moment.";
  const lines = open.map((t) => {
    const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
    const age = Math.max(0, -dayDiff(t.createdAt));
    const seen = t.touchedAt ? "" : " · jamais entamé";
    const note = t.note ? `\n    contexte : ${t.note}` : "";
    return `- [${kind}] ${t.text}${dueLabel(t.due)} · déposé il y a ${age}j${seen}${note}`;
  });
  return `${open.length} trucs ouverts :\n${lines.join("\n")}`;
}

function systemPrompt(threads: Thread[], name?: string): string {
  const who = name ? ` La personne s'appelle ${name}.` : "";
  const now = new Date();
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return `Tu es le guide d'Élan, pour une personne avec un TDAH (ou une charge mentale qui déborde).${who}

NOUS SOMMES LE ${today}, il est ${time}. Sers-t'en pour tout raisonnement sur les délais — ne devine jamais le temps qui a passé.

OÙ TU ES : c'est une discussion LIBRE, en dehors d'une séance. Pas de minuteur, pas de programme, pas de premier pas à arracher. La personne vient parler : donner des nouvelles, réfléchir à voix haute sur un truc, demander comment s'organiser demain ou cette semaine, ou juste poser une question. Tu réponds, simplement.

CE QUE TU FAIS ICI :
- Tu ES au courant de tout ce qu'elle a en cours (liste plus bas). Sers-t'en pour répondre concrètement, en citant ses trucs par leur nom.
- Si elle demande comment s'organiser (demain, cette semaine), propose une forme claire et légère : quoi, quand, pourquoi dans cet ordre. Deux ou trois moments, pas un planning complet.
- Si elle veut réfléchir à un truc, aide-la à le découper, à décider, ou à trouver la première phrase à écrire. Tu peux proposer un modèle de mail ou quoi dire au téléphone.
- Si elle donne des nouvelles (« j'ai appelé le dentiste »), accuse réception en une phrase et enchaîne naturellement. Ce qu'elle dit est enregistré automatiquement sur ses trucs — ne lui demande jamais de noter quoi que ce soit.

CE QUE TU NE FAIS PAS :
- Tu ne lances pas de séance et tu ne pousses pas au travail. Si ça s'y prête vraiment, tu peux glisser une fois « on peut en faire une séance si tu veux », puis tu lâches.
- Tu ne récites jamais la liste. Un ou deux trucs cités au maximum.
- Tu ne culpabilises jamais, tu ne comptes pas les retards.

RÈGLES QUI NE BOUGENT PAS :
- LE CONTEXTE PRIME SUR LA DATE. Si le contexte d'un truc énonce une condition (« dès réception du salaire », « après mon rdv de jeudi »), c'est elle qui fait foi : tant qu'elle n'est pas remplie, le truc n'est pas en retard, même si sa date est passée.
- NE PENSE PAS À VOIX HAUTE. Si tu repères une alerte puis que tu l'écartes, n'en parle pas du tout.
- CE QUI A ÉTÉ ÉCARTÉ RESTE ÉCARTÉ. Si un contexte dit qu'un truc est déjà prévu ou reporté, ne le repropose pas.
- Les COURSES / SORTIES (poste, magasin, rdv sur place) ne se font pas assis : ne les propose comme faisables que si elle est déjà dehors.

TON : tutoiement, chaleureux, direct, humain. COURT — 2 à 4 phrases. Pas de markdown, pas de titres, pas de listes à puces à rallonge, pas d'émoji décoratif. Une conversation, pas un rapport.

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
