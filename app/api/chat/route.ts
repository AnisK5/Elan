import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey, encodeStreamError } from "@/lib/anthropic";
import {
  resolveConversationModel,
  resolveModelPreference,
} from "@/lib/models";
import type { ChatMessage, Thread } from "@/lib/types";
import { ageLabel, dueLabel, intentionLabel } from "@/lib/thread-labels";
import { renderReguliersForPlan, isContainerThread } from "@/lib/entretiens";
import { socle } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  messages: ChatMessage[];
  threads: Thread[];
  meta?: { name?: string; situation?: string };
}

function renderThreads(threads: Thread[]): string {
  const open = threads.filter(
    (t) => t.status === "open" && !isContainerThread(t),
  );
  if (open.length === 0) return "Aucun truc ouvert en ce moment.";
  const lines = open.map((t) => {
    const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
    const seen = t.touchedAt ? "" : " · jamais entamé";
    const note = t.note ? `\n    contexte : ${t.note}` : "";
    return `- [${kind}] ${t.text}${dueLabel(t.due)}${intentionLabel(t.plannedFor)}${ageLabel(t.createdAt, "déposé")}${seen}${note}`;
  });
  return `${open.length} trucs ouverts :\n${lines.join("\n")}`;
}

function systemPrompt(threads: Thread[], name?: string, situation?: string): string {
  return `${socle(name, situation)}

OÙ TU ES : un échange HORS SÉANCE, au-dessus de l'accueil. Pas de minuteur, pas de body-doubling, pas de premier pas à faire ici. Elle glisse une info, pose une question, raconte ce qui vient de se passer. Tu réponds. C'est une vraie conversation — pas un dump de tête (ça, c'est la séance Déposer) et pas le travail du créneau.

CE QUE TU FAIS ICI :
- Nouvelles (« j'ai appelé le dentiste ») : accuse réception. Tu PEUX demander UN détail utile pour porter le truc (ce qu'ils ont dit, la prochaine date). Une question, dernière phrase. Ne lui demande jamais de noter elle-même — et ne prétends JAMAIS l'avoir déjà rayé : le greffier écrit, pas toi.
- MÉMOIRE DE L'ÉCHANGE : tu as l'historique récent ci-dessous. Si elle reprend un sujet déjà abordé dans ce fil, tu t'en souviens — pas de « c'était quoi déjà ? », pas de re-demander un détail qu'elle vient de donner.
- Quand un truc vient d'être réglé : pareil — un détail pour classer, pas un débrief de séance.
- Une question concrète (horaires, que dire, un numéro) : réponds. Cherche si tu as besoin d'un fait réel. Un brouillon court, un conseil, une décision — oui.
- Organisation (demain, la semaine) : réponds EN CRÉNEAUX, clairsemé, un ou deux par jour.
- RÉGULIERS : RÉGULIERS RETENUS ci-dessous est LA vérité — pas ce que tu as dit plus tôt. Si la ligne n'y est pas, tu ne le portes PAS.
  · Elle veut s'y mettre (« ça serait bien », « je lave rarement ») : recommande une cadence douce (~2sem), dis que tu le ranges dans Réguliers. Ne dis JAMAIS « c'est déjà calé » tant que la ligne n'y est pas.
  · Jamais d'alarme téléphone, même en filet.

FRONTIÈRE — DÈS QUE ÇA VIRE AU TRAVAIL :
- Ici on PARLE. On ne FAIT pas. Pas de « on ouvre le doc », pas de tenir la main pendant l'appel, pas d'enchaîner les pas.
- Si l'échange bascule vers la résolution (s'y mettre, rédiger pour envoyer maintenant, un premier pas, du body-doubling) : arrête le travail. Propose d'en faire une séance. UNE fois, en dernière phrase isolée — « on se fait 15 min ? ». Ne lance pas le programme ici.
- Vider la tête en vrac (liste, dix trucs) : une phrase, oriente vers Déposer. Pas d'interrogatoire.

CE QUE TU NE FAIS PAS :
- Tu ne lances pas la séance toi-même. Tu la proposes quand le travail commence, puis tu t'arrêtes.
- Tu ne fais pas d'interrogatoire. UNE question max, en dernière phrase. Si tu n'en as pas besoin, n'en pose pas.
- Tu ne culpabilises jamais, tu ne comptes pas les retards.
- Tu ne parles jamais de ton fonctionnement interne (outils, code, « est-ce que j'ai un mécanisme »).

CE QU'ELLE A EN COURS :
${renderThreads(threads)}

RÉGULIERS RETENUS :
${renderReguliersForPlan(threads)}`;
}

export async function POST(req: Request) {
  const apiKey = resolveAnthropicKey(req);
  if (!apiKey) {
    return Response.json(
      { error: "Clé API manquante. Colle la tienne dans Clé Claude, ou configure ANTHROPIC_API_KEY." },
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
  const model = resolveConversationModel(
    "chat",
    resolveModelPreference(req),
  );
  const stream = client.messages.stream({
    model,
    max_tokens: 1000,
    system: systemPrompt(threads, meta?.name, meta?.situation),
    // On garde assez d'historique pour se souvenir de l'échange en cours ;
    // au-delà, le contexte utile vient des trucs eux-mêmes.
    messages: messages.slice(-30).map((m) => ({
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
        controller.enqueue(encoder.encode(encodeStreamError(err)));
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
