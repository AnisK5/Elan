import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey } from "@/lib/anthropic";
import { recordMessageUsage } from "@/lib/api-usage";
import { resolveUtilityModel } from "@/lib/models";
import { systemPromptBlocks } from "@/lib/prompt-cache";
import type { ChatMessage, Thread } from "@/lib/types";
import { mergeRegulierWrites, reguliersWriteNote, upsertRegulierOps, extractReguliersFromConvo } from "@/lib/reguliers-write";
import { mergeShoppingWrites, shoppingWriteNote, shoppingOpsForThreads } from "@/lib/shopping-write";
import { mergeTurnWrites } from "@/lib/reconcile-turn";
import { extractSituationFromConvo, mergeSituation } from "@/lib/situation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  threads: Thread[];
  messages: ChatMessage[];
  /** Cadre de vie déjà retenu — évite de re-notifier à chaque message. */
  situation?: string | null;
}

function renderThreads(threads: Thread[]): string {
  const open = threads.filter((t) => t.status === "open");
  if (open.length === 0) return "(aucun truc ouvert)";
  return open
    .map((t) => {
      const kind = t.kind === "suivi" ? "suivi" : "action";
      const due = t.due ? `, échéance ${t.due.slice(0, 10)}` : "";
      const effort = t.effort ? `, effort ${t.effort}` : "";
      const note = t.note ? ` | contexte connu: "${t.note}"` : "";
      return `- id=${t.id} | "${t.text}" (${kind}${due}${effort})${note}`;
    })
    .join("\n");
}

function renderConvo(messages: ChatMessage[]): string {
  const recent = messages.slice(-8);
  if (recent.length === 0) return "(vide)";
  const lastUserIdx = [...recent]
    .map((m, i) => (m.role === "user" ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  return recent
    .map((m, i) => {
      const who = m.role === "user" ? "MOI" : "ÉLAN";
      const tag =
        lastUserIdx !== undefined && i >= lastUserIdx ? " ← TOUR ACTUEL" : "";
      return `${who}${tag}: ${m.content}`;
    })
    .join("\n");
}

const RECONCILE_CORE = `Tu es le "greffier" d'Élan. Ton seul rôle : après un échange — séance OU une info glissée hors séance — mettre à jour les trucs de la personne à partir de ce qui vient d'être dit, pour qu'elle n'ait jamais à le faire elle-même.

RÈGLES (tu es CONSERVATEUR) :
- TOUR ACTUEL SEULEMENT : les messages marqués « ← TOUR ACTUEL » (dernier message utilisateur + éventuelle réplique) sont ce que tu ranges MAINTENANT. Le reste de l'échange est du CONTEXTE déjà traité — ne le re-range pas, ne le re-résume pas.
- EXCEPTION RÉGULIERS — passe AVANT le conservatisme : si l'échange parle d'un rythme de vie (linge, draps, loyer, URSSAF…) AVEC une fréquence — même seulement recommandée par Élan et non refusée — tu DOIS l'écrire dans le fil "Réguliers". Un « c'est déjà noté » d'Élan ne compte PAS : vérifie LES TRUCS ACTUELS. Fil absent ou ligne absente → add/note. Elle qui dit que le fil est vide = tu écris MAINTENANT.
- N'agis QUE sur ce qui est clairement dit ou confirmé dans le TOUR ACTUEL. Dans le doute, ne fais rien.
- HORS SÉANCE (« j'ai appelé », « c'est envoyé », « c'est fait », « c'est rendu », un détail, une date) : elle a parlé POUR que tu ranges. C'est aussi net qu'une séance. Écris les ops. Ne reste pas les bras croisés parce que l'échange est court. Si elle nomme un truc ouvert et dit que c'est fait / rendu / réglé / plus à faire — "done" sur CET id, tout de suite.
- CONTEXTE DE VIE : si elle dit où elle est, jusqu'à quand, ce qui change ce qui est faisable (« je suis à Vienne », « pas chez moi », « je reviens le 28 ») — écris-le dans le champ "situation" (une phrase factuelle, date ancrée). Ce n'est PAS un truc : ne snooze pas tout le lot. Le conseil du matin lira ce cadre.
- N'invente jamais un truc qui n'a pas été évoqué.
- Ne supprime jamais. Pour un truc terminé, utilise "done" (réversible), pas une suppression.
- Ne marque "done" que si la personne a clairement dit que c'était fait (« c'est fait », « c'est rendu », « c'est réglé », « plus besoin »). Un « oui » à « c'est fait, le coffre ? » compte. Un « oui » à « le salaire est arrivé ? » ne clot PAS le déplacement : note la condition, ne "done" pas.
- L'id d'une op, c'est le champ id= de la ligne, PAS le libellé. Si tu vises « Rendre argent au coffre », copie l'id tel quel.
- ENVOYÉ / CONTACTÉ / RELANCÉ = ACTION FAITE. Si la personne dit qu'elle a envoyé un mail, passé un appel, fait une relance, posté, soumis, commandé — l'action correspondante EST faite. Ne laisse JAMAIS un truc « relancer X » / « contacter X » / « envoyer X » ouvert et inchangé alors qu'elle vient de le faire (sinon le conseil du matin lui re-proposera de le refaire — confiance brisée). Deux cas, et tu DOIS écrire les ops dans les DEUX :
  · Si l'action clôt le truc (rien de plus à attendre) → "done".
  · Si ça met le truc EN ATTENTE d'une réponse d'un tiers → OBLIGATOIREMENT les trois à la fois : (1) kind "suivi", (2) "note" qui commence par « relancé le [date d'aujourd'hui JJ/MM] » ou « envoyé le [JJ/MM] », en attente de réponse, (3) "due" pour la PROCHAINE relance (typiquement dans ~1 semaine si aucun délai dit), PAS aujourd'hui. Sans la note datée du jour, le plan du lendemain croira que ce n'est pas fait.
- REPORTER / PRÉFÉRER UN JOUR (crucial) : « je préfère relancer X lundi », « plutôt demain », « on reporte à vendredi » = ce n'est PAS fait. Interdit de "done" ou d'écrire « relancé » / « relancée ». Utilise {"op":"set","id":"...","plannedFor":"YYYY-MM-DD"} pour le jour visé + une "note" « Relance prévue [jour JJ/MM] ». Ne touche AUCUN autre truc que celui nommé dans le message.
- Améliore un nom ("rename") seulement si l'échange apporte une formulation plus juste/précise (ex. "appeler le garage" → "appeler le garage pour le contrôle technique").
- Complète des infos ("set") seulement si elles sont explicites (une date mentionnée, un effort évoqué, un changement action↔suivi).
- "add" seulement pour un nouveau truc clairement évoqué et absent de la liste.
- COURSES / SUPERMARCHÉ (important) : les achats courants (lait, pain, produits ménagers, courses alimentaires…) ne créent PAS chacun un thread séparé — ça gonflerait artificiellement le backlog. Un seul fil conteneur "Courses" porte toute la liste dans sa "note", articles séparés par « · ». Si "Courses" n'existe pas encore : {"op":"add","text":"Courses","kind":"action","note":"lait"}. Si elle existe déjà : {"op":"note","id":"<id du fil Courses>","note":"lait · pain · lessive"} en fusionnant avec la note existante, sans doublons, en gardant l'ordre logique. Les missions ponctuelles en magasin spécifique (« acheter des chaussures chez Decathlon », « retourner la robe chez Zara ») restent des threads séparés — ce ne sont pas des courses alimentaires.
- ACHATS MAISON / BRICOLAGE (patins, ampoules, vis, patère…) : si la note dit « à acheter », « pas en stock », « commander », « à récupérer » — ajoute l'article au fil "Courses" (ex. « patins chaises ») ET laisse le thread principal OUVERT pour la pose une fois le matériel là. Ne marque JAMAIS "done" tant que l'achat n'est pas fait ou la pose pas confirmée.
- RÉGULIERS (loyer, URSSAF, prélèvements, linge, draps, appels réguliers… — ce qui REVIENT) : dès qu'elle CONFIRME un rythme (« toutes les 2 semaines », « une fois par mois »), tu DOIS l'écrire dans le fil conteneur "Réguliers". Pas un thread séparé. Pas « c'est noté » sans op.
  · Un seul fil "Réguliers" (accepte legacy "Rythmes" / "Entretiens"). UN régulier par LIGNE :
    libellé · ~cadence · YYYY-MM-DD · contexte optionnel
    ex. linge de lit · ~2sem · 2026-08-18
    ex. URSSAF · ~1mois · 2026-07-01
  · Cadence : ~Nsem, ~Nmois, ~Nj. « 1 semaine et demie à 2 semaines » → ~2sem.
  · La date = dernière FOIS FAITE, pas le jour où on l'inscrit.
    Elle vient de le faire → aujourd'hui. Pas encore fait / rarement / premier passage / « dès que possible » → date d'il y a AU MOINS une cadence (ex. ~2sem → soustrais 14 jours). JAMAIS aujourd'hui dans ce cas : ça ferait croire que c'est déjà fait et on ne le proposerait pas.
  · Quand c'est fait : mets à jour la date du jour sur la ligne, et retire le contexte de premier passage (« pas fait », « à lancer ») — ne marque JAMAIS "done" le fil conteneur.
  · Pour ajouter : fusionne les lignes via {"op":"note","id":"...","note":"..."} ; si le fil n'existe pas : {"op":"add","text":"Réguliers","kind":"action","note":"linge de lit · ~2sem · YYYY-MM-DD"}.
  · Pour retirer : enlève la ligne.
- CONTEXTE ("note") : c'est important. Dès que la personne donne du contexte sur un truc — les enjeux (« mon père attend ça, il risque de m'engueuler »), qui est impliqué, une intention douce (« j'aimerais le faire cette semaine »), une contrainte, une conséquence, où ça en est — capture-le dans une "note" sur ce truc. C'est ce qui permettra plus tard de bien le prioriser et de le surfacer au bon moment. Fusionne avec le "contexte connu" déjà présent (ne l'écrase pas bêtement : garde ce qui compte, ajoute le nouveau, condense). Reste factuel et bref.
- DEUX GESTES À NE JAMAIS CONFONDRE quand une date est évoquée :
  · « JE M'EN OCCUPE LE JOUR J » (« demain matin on organise le kayak », « je m'y mets lundi ») → c'est une INTENTION DE TRAVAIL. Utilise {"op":"set","id":"...","plannedFor":"YYYY-MM-DD"}. Ça ne cache rien : ça fait REMONTER le truc ce jour-là, pour qu'on le lui propose au bon moment. Ne le mets SURTOUT PAS en pause : elle veut s'en occuper, pas l'oublier.
  · « PAS AVANT / VERS / À PARTIR DU / AUTOUR DE » (« à faire vers le 1er septembre », « à partir du 29/08 », « pas avant mon retour ») → ce n'est PAS une fenêtre à saisir maintenant, et ce n'est PAS une "due". C'est un ÉCART jusqu'à cette date : {"op":"snooze","id":"...","until":"YYYY-MM-DD"} (la date dite, pour que le truc REVIENNE ce jour-là), plus une "note" ancrée (« À faire vers le 01/09/2026 »). INTERDIT de mettre ça en "due" : le conseil du matin lirait « fenêtre ouverte encore Nj » et proposerait le truc trop tôt.
  · « C'EST DÉJÀ RÉGLÉ AILLEURS / ON EN REPARLE PLUS TARD » (« mon appel est confirmé jeudi », « on en reparle le mois prochain ») → aussi un ÉCART. {"op":"snooze","id":"...","until":"<le lendemain de la date concernée>"}, plus une "note" qui dit quoi (« appel confirmé jeudi 31/07 »). Sans ça il reviendra dès la prochaine séance et on lui reproposera ce qu'elle vient d'écarter — elle a parlé, et on ne l'a pas écoutée.
  · Dans le doute entre intention (plannedFor) et écart (snooze) : si elle dit clairement qu'elle veut S'Y METTRE le jour J → plannedFor ; si elle dit que ce n'est PAS ENCORE le moment → snooze. Proposer trop tôt est pire que faire remonter un jour trop tôt.
  · Pour effacer une intention devenue caduque : {"op":"set","id":"...","plannedFor":null}.
  · UN JOUR DE SORTIE VAUT POUR TOUT LE LOT. Si la personne dit quand elle sort (« je sors jeudi », « je passe en ville demain »), c'est une intention de travail pour TOUS les trucs de l'échange qui demandent de sortir (poste, magasin, rdv sur place, courses) — pose plannedFor à cette date sur chacun d'eux, pas seulement sur le dernier nommé. Reste conservateur : uniquement les trucs réellement évoqués dans l'échange, jamais des sorties que tu vas deviner ailleurs dans la liste.
  · Une sortie calée se note EN ENTIER, parce que plannedFor ne porte qu'un jour : ajoute une "note" qui garde l'HEURE convenue et ce qui est PRÊT (« sortie calée jeudi 17h, enveloppe timbrée près de la porte »). Le jour la fait remonter, la note dit quoi emporter et quand partir — sans elle, la moitié du travail du créneau est perdue.
- Une intention douce (« aimerais cette semaine ») va dans la "note", PAS dans une échéance ("set" due) : l'échéance est réservée aux vraies contraintes externes. MAIS un délai réel imposé par un tiers (« ils me rappellent sous 2 jours », « réponse sous une semaine ») EST une vraie échéance → mets-le dans "set" due (date absolue), pas seulement en note.
- LE TIMING A CHANGÉ → METS À JOUR L'ÉCHÉANCE (important). Si la personne rapporte qu'elle a fait sa part et attend désormais un retour/rappel avec un délai (« c'est envoyé, ils me recontactent sous 2 jours »), l'ANCIENNE échéance n'est plus valable : fais un "set" pour REMPLACER "due" par la nouvelle date attendue (aujourd'hui + le délai, en absolu), et bascule le truc en kind "suivi" s'il attend maintenant un tiers. Ne laisse JAMAIS traîner une ancienne échéance périmée — elle déclencherait une fausse urgence (« ça se ferme aujourd'hui ») alors que la situation a avancé.
- TEXTE BRUT UNIQUEMENT. Aucune balise, aucun markdown, aucun indice de source dans "text" et "note" (jamais de <cite>, de index="…", d'astérisques). Ce que tu écris là est affiché tel quel.
- ANCRE LE TEMPS. Ne laisse JAMAIS un repère temporel relatif tel quel dans une note (« cette semaine », « demain », « dans 3 jours », « lundi prochain ») — il perdrait son sens relu plus tard. Convertis-le en repère ABSOLU à partir de la date d'aujourd'hui, ex. « aimerait s'en occuper d'ici dimanche 19/07 » plutôt que « cette semaine ». Idem pour toute vraie échéance déduite (« set » due) : calcule la date réelle à partir d'aujourd'hui.

FORMAT DE SORTIE : uniquement un objet JSON, rien d'autre :
{"updates": [ ... ], "note": "...", "situation": "..."}

Chaque update est un de ces objets :
- {"op":"done","id":"<id>"}
- {"op":"snooze","id":"<id>","until":"YYYY-MM-DD"}  ("until" optionnel — sans lui, le truc revient demain)
- {"op":"rename","id":"<id>","text":"<nouveau nom>"}
- {"op":"note","id":"<id>","note":"<contexte fusionné, factuel et bref>"}
- {"op":"set","id":"<id>","due":"YYYY-MM-DD","effort":"S|M|L","kind":"action|suivi","plannedFor":"YYYY-MM-DD"}  (mets seulement les champs concernés ; plannedFor = jour où elle veut s'en occuper, null pour l'annuler)
- {"op":"add","text":"<nom>","kind":"action|suivi","due":"YYYY-MM-DD","effort":"S|M|L","note":"<contexte>"}  (due/effort/note optionnels)

"note" : un résumé TRÈS court et humain de ce que tu as changé DANS CE TOUR SEULEMENT, en français, pour l'afficher à la personne (ex. "impôts ✓ · Paul repoussé à vendredi"). Jamais un récap de l'historique ni des tours précédents. Si tu ne changes rien, renvoie {"updates": [], "note": ""}.
"situation" : seulement si le TOUR ACTUEL pose ou met à jour le cadre de vie (où elle est, jusqu'à quand). Une phrase. Sinon omets le champ.`;

function reconcileDynamic(threads: Thread[], messages: ChatMessage[]): string {
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return `AUJOURD'HUI : ${today}. Sers-t'en pour dater et ancrer tout repère temporel.

LES TRUCS ACTUELS (avec leur id) :
${renderThreads(threads)}

L'ÉCHANGE RÉCENT :
${renderConvo(messages)}`;
}

const CUE =
  "[Mets à jour mes trucs si — et seulement si — l'échange le justifie clairement. Réponds uniquement avec le JSON.]";

function safeParse(text: string): {
  updates: unknown[];
  note: string;
  situation?: string;
} | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (Array.isArray(o.updates)) {
      return {
        updates: o.updates,
        note: typeof o.note === "string" ? o.note : "",
        situation:
          typeof o.situation === "string" && o.situation.trim()
            ? o.situation.trim()
            : undefined,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function withShopping(
  threads: Thread[],
  messages: ChatMessage[],
  greffier: { updates: unknown[]; note: string; situation?: string },
): { updates: unknown[]; note: string; situation?: string } {
  const filtered = mergeShoppingWrites(threads, messages, greffier.updates);
  const ours = shoppingOpsForThreads(threads, filtered);
  const updates = ours.length > 0 ? [...filtered, ...ours] : filtered;
  if (ours.length === 0) return { ...greffier, updates };
  const extra = shoppingWriteNote(ours);
  const note = greffier.note?.trim()
    ? greffier.note.includes("Courses")
      ? greffier.note
      : `${greffier.note} · ${extra}`
    : extra;
  return { ...greffier, updates, note };
}

function withReguliers(
  threads: Thread[],
  messages: ChatMessage[],
  greffier: { updates: unknown[]; note: string; situation?: string },
): { updates: unknown[]; note: string; situation?: string } {
  const ours = upsertRegulierOps(
    threads,
    extractReguliersFromConvo(messages),
  );
  const updates = mergeRegulierWrites(threads, messages, greffier.updates);
  if (ours.length === 0) return { ...greffier, updates };
  const extra = reguliersWriteNote(ours);
  const note = greffier.note?.trim()
    ? greffier.note.includes("Réguliers")
      ? greffier.note
      : `${greffier.note} · ${extra}`
    : extra;
  return { ...greffier, updates, note };
}

function applyTurnScope(
  threads: Thread[],
  messages: ChatMessage[],
  greffier: { updates: unknown[]; note: string; situation?: string },
): { updates: unknown[]; note: string; situation?: string } {
  return {
    ...greffier,
    updates: mergeTurnWrites(threads, messages, greffier.updates),
  };
}

function withWrites(
  threads: Thread[],
  messages: ChatMessage[],
  greffier: { updates: unknown[]; note: string; situation?: string },
  previousSituation?: string | null,
): { updates: unknown[]; note: string; situation?: string } {
  const after = withShopping(
    threads,
    messages,
    withReguliers(threads, messages, applyTurnScope(threads, messages, greffier)),
  );
  const extracted = extractSituationFromConvo(messages);
  const fromModel = after.situation?.trim()
    ? { text: after.situation.trim() }
    : null;
  const situation = mergeSituation(extracted, fromModel);
  if (!situation) return after;
  const prev = previousSituation?.trim() ?? "";
  const changed = situation.text.trim() !== prev;
  // Ne recolle pas « cadre de vie » à chaque message si c'est déjà retenu.
  if (!changed) {
    const { situation: _drop, ...rest } = after;
    return rest;
  }
  const extra = "cadre de vie retenu";
  const note = after.note?.trim()
    ? after.note.includes("cadre de vie")
      ? after.note
      : `${after.note} · ${extra}`
    : extra;
  return { ...after, note, situation: situation.text };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ updates: [], note: "" });
  }

  const threads = body.threads ?? [];
  const messages = body.messages ?? [];
  const previousSituation = body.situation ?? null;
  if (threads.length === 0 && messages.length === 0)
    return Response.json({ updates: [], note: "" });

  const empty = { updates: [] as unknown[], note: "" };
  const apiKey = resolveAnthropicKey(req);
  if (!apiKey) {
    return Response.json(
      withWrites(threads, messages, empty, previousSituation),
    );
  }

  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  try {
    const res = await client.messages.create({
      model: resolveUtilityModel(),
      max_tokens: 600,
      system: systemPromptBlocks(RECONCILE_CORE, reconcileDynamic(threads, messages)),
      messages: [{ role: "user", content: CUE }],
    });
    void recordMessageUsage(
      req,
      res,
      {
        route: "reconcile",
        sessionContext: messages.length > 4 ? "session" : "chat",
        exchangeKind: "reconcile",
      },
      startedAt,
    );
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const parsed = safeParse(text) ?? empty;
    return Response.json(
      withWrites(threads, messages, parsed, previousSituation),
    );
  } catch {
    return Response.json(
      withWrites(threads, messages, empty, previousSituation),
    );
  }
}
