import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey } from "@/lib/anthropic";
import type { SessionContext, Thread } from "@/lib/types";
import {
  isContainerThread,
  renderReguliersForPlan,
  findReguliersThread,
  reguliersDueFromThreads,
  parseReguliers,
  isReguliersListEmpty,
  REGULIERS_DISCOVERY_PROMPT,
  REGULIERS_FOCUS_PROMPT,
} from "@/lib/entretiens";
import { ageLabel, dayDiff, dueLabel, intentionLabel } from "@/lib/thread-labels";
import { identity, socle, today, TON, VOIX } from "@/lib/voice";
import { DEPOSER_PLAN_MESSAGE } from "@/lib/session-mode";
import { buildOfflinePlanHint } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PlanStats {
  addedLast7: number;
  doneLast7: number;
  sessionsLast7: number;
  minutesLast7: number;
  daysSinceLastSession: number | null;
  stale14: number;
}

interface Body {
  threads: Thread[];
  stats?: PlanStats;
  chosen?: number;
  context?: SessionContext;
  meta?: { name?: string };
  /** Corps court pour notif push — pas le paragraphe conseil de l'accueil. */
  forNotify?: boolean;
  /** Conseil déjà composé (accueil / mail) — la notif le raccourcit, elle ne recompose pas. */
  sourceMessage?: string;
}

function renderLines(threads: Thread[]): string {
  const open = threads.filter(
    (t) => t.status === "open" && !isContainerThread(t),
  );
  if (open.length === 0) return "(rien de pertinent en ce moment)";
  const overdue = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const lines = open
    .map((t) => {
      const kind = t.kind === "suivi" ? "À SUIVRE" : "ACTION";
      const effort = t.effort ? ` · effort ${t.effort}` : "";
      const note = t.note ? ` · liste/contexte: ${t.note}` : "";
      return `- [${kind}] ${t.text}${dueLabel(t.due, "plan")}${intentionLabel(t.plannedFor)}${ageLabel(t.createdAt, "déposé")}${effort}${note}`;
    })
    .join("\n");
  return `${open.length} trucs ouverts (${overdue} dont la fenêtre est passée) :\n${lines}`;
}

function findCoursesThread(threads: Thread[]): Thread | undefined {
  return threads.find(
    (t) => t.status === "open" && t.text.trim().toLowerCase() === "courses",
  );
}

function openThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.status === "open");
}

function renderStats(s?: PlanStats): string {
  if (!s) return "Rythme récent : inconnu.";
  const last =
    s.daysSinceLastSession === null
      ? "jamais fait de séance"
      : s.daysSinceLastSession === 0
        ? "dernière séance aujourd'hui"
        : s.daysSinceLastSession === 1
          ? "dernière séance hier"
          : `dernière séance il y a ${s.daysSinceLastSession}j`;
  return `RYTHME RÉCENT (7 derniers jours) :
- déposés : ${s.addedLast7} · bouclés : ${s.doneLast7}
- séances : ${s.sessionsLast7} (${s.minutesLast7} min au total) · ${last}
- trucs ouverts déposés il y a plus de 14j : ${s.stale14}`;
}

function outdoorSocle(name?: string): string {
  return [identity(name), today(), VOIX, TON].join("\n\n");
}

function coursesPlanPrompt(threads: Thread[], name?: string): string {
  const open = openThreads(threads);
  const courses = findCoursesThread(open);
  const listBlock = courses
    ? courses.note?.trim()
      ? `Fil "Courses" — liste actuelle :\n${courses.note.trim()}`
      : `Fil "Courses" présent mais liste vide.`
    : `Aucun fil "Courses" — pas de liste pour l'instant.`;

  const others = open.filter((t) => t !== courses);
  const othersBlock =
    others.length > 0
      ? `\n\nAUTRES TRUCS OUVERTS (tu peux proposer un arrêt en plus si ça se fait sur le trajet — poste, pharmacie… — mais le centre reste les courses) :\n${renderLines(others)}`
      : "";

  return `${outdoorSocle(name)}

LA PERSONNE VIENT DE CLIQUER « COURSES ». Elle va au supermarché — ce n'est PAS une séance bureau.

RÈGLE ABSOLUE : le CENTRE, c'est la liste de courses (fil "Courses"). IGNORE le travail de bureau (organiser un voyage, réfléchir assis, mails, docs, kayak…).

MAIS : si un autre truc ouvert demande clairement de SORTIR (poste, pharmacie, banque, rdv sur place), tu PEUX proposer d'en profiter sur le même trajet (« tant qu'on y est, on passe à la poste ? »). C'est un bonus, pas le sujet principal.

TON RÔLE : 1 à 2 phrases courtes, chaleureuses.
- Si une liste existe : cite-la en partie, propose d'y aller.
- Si pas de liste : propose de la construire en séance.
- Arrêt en plus sur le trajet : une demi-phrase max, seulement si c'est évident dans les trucs ci-dessous.
- Pas de durée en minutes. Pas de créneau bureau.

RÉPONDS UNIQUEMENT avec : {"message": "...", "pick": "15"}

${listBlock}${othersBlock}`;
}

function sortiePlanPrompt(threads: Thread[], name?: string): string {
  const open = openThreads(threads);
  const block = renderLines(open);

  return `${outdoorSocle(name)}

LA PERSONNE VIENT DE CLIQUER « SORTIE ». Elle sort de chez elle — ce n'est PAS une séance bureau.

RÈGLE ABSOLUE : tu ne parles QUE des trucs qui exigent de SE DÉPLACER. Déduis-le du texte ET du contexte de chaque truc. IGNORE le travail assis (organiser un voyage, choix kayak/Asie, mails, docs, réflexion…).

TON RÔLE : 1 à 2 phrases courtes, chaleureuses.
- Regroupe ce qui se fait sur le même trajet.
- Vérifie ce qui est prêt (enveloppe, ordonnance…).
- Si un fil "Courses" a une liste, propose d'en profiter pour le super — une sortie, plusieurs arrêts.
- Si aucun truc ne demande vraiment de sortir : dis-le honnêtement.
- Pas de durée en minutes. Pas de créneau bureau.

RÉPONDS UNIQUEMENT avec : {"message": "...", "pick": "15"}

TOUS SES TRUCS OUVERTS (tu filtres toi-même ce qui est dehors) :
${block}`;
}

function deskPlanPrompt(
  threads: Thread[],
  allThreads: Thread[],
  stats?: PlanStats,
  chosen?: number,
  name?: string,
): string {
  const chosenRule = chosen
    ? `\n\nDURÉE DÉJÀ CHOISIE : ${chosen} min. Elle vient de cliquer ce bouton — c'est SON choix. Renvoie "pick":"${chosen}" (pas "sortie").
Le pavé conseil DOIT relier le bouton et le contenu, en PHRASE COMPLÈTE : « Pour ce créneau de ${chosen} min, je propose que l'on relance Laura en un message. »
Si le vrai mouvement du jour est une Sortie (conséquence dehors, sorties qui s'accumulent), UNE phrase ensuite, une fois, sans insister : « Si tu peux sortir, je te proposerais plutôt une Sortie, pour le doc de ton père. »
Si ${chosen} min est vraiment juste pour un truc ASSIS, UNE phrase ensuite, une fois : « Ça risque d'être juste ; je te proposerais plutôt un créneau de 30 min, pour aussi le linge. » Pas le mot urgence. Tu fais quand même avec les ${chosen} min.`
    : "";
  const render = renderLines(threads);

  return `${socle(name)}

TON RÔLE ICI : à partir de ses trucs en cours, tu conseilles la FORME de sa journée d'aujourd'hui, avant même qu'elle commence son créneau.

TA SORTIE : 2 phrases max, COMPLÈTES (sujet, verbe, complément — pas de titre, pas de tirets). Le conseil PORTE SUR UN CRÉNEAU — et le bouton doit matcher (5/15/30/50 min OU Sortie). Tu conseilles le créneau (champ "pick") ET tu le nommes dans le message. Pas de jargon (borné, calibré, fenêtre, pick). UN seul truc dans CE créneau.
Si tu proposes la durée : « Je te propose un créneau de 15 min, pour que l'on relance Laura en un message. »
Si tu proposes une Sortie : « Je te propose une Sortie, pour imprimer le doc de ton père à la papeterie — et la pharmacie sur le trajet. »
Si elle a déjà cliqué : vois DURÉE DÉJÀ CHOISIE ci-dessous.
Exemples (quand TU proposes) :
- « Je te propose un créneau de 15 min, pour que l'on relance Laura en un message — c'est dans 6 jours. »
- « Je te propose un créneau de 5 min, pour que l'on mette le linge en machine — et ça tourne sans toi. »
- « Je te proposerais un créneau de 50 min, ou deux de 30, pour avancer la déclaration tant que c'est ouvert. »
- « Je te propose une Sortie, pour imprimer le doc de ton père — pharmacie sur le même trajet. »

DURÉE (champ "pick"), une seule valeur parmi "5", "15", "30", "50", ou "sortie" :
- "sortie" = le créneau du jour EST une Sortie (bouton Sortie). À utiliser quand ce qui pèse vraiment exige de se déplacer.
- "5" = ~5 min : quasi rien à faire, ou juste faire le point / poser un truc / un micro-pas pour se lancer.
- "15" = le défaut pour une journée normale : de quoi débloquer un ou deux trucs tranquilles.
- "30" = journée un peu chargée, ou un truc qui demande un vrai moment posé.
- "50" (ou suggérer deux séances plus courtes DANS LE MESSAGE) = il faut une vraie raison de prendre plus de temps AUJOURD'HUI. Trois raisons valables : une échéance / fenêtre qui se ferme bientôt et qu'une séance plus longue permet d'attraper à temps ; un rythme qui décroche (voir plus bas) ; ou une personne qui a clairement envie de s'y mettre à fond.
- LE VOLUME SEUL NE CRÉE PAS D'URGENCE : une longue liste où tout avance normalement ne justifie pas d'en rajouter. Reste sur "15" (ou "5"), et rappelle qu'on avance un peu chaque jour.
- MAIS LA TENDANCE, ELLE, COMPTE — et l'ignorer serait te rendre passif, ce qui est un défaut aussi grave que stresser. Lis le RYTHME RÉCENT et réagis :
  · Si on dépose nettement plus qu'on ne boucle, ou si les séances se sont espacées / arrêtées, ou s'il y a un paquet de trucs qui traînent depuis plus de deux semaines sans bouger : le rythme actuel ne suffit pas, DIS-LE simplement, et OFFRE plus de capacité. Trois formes : une séance bureau plus longue ("30" ou "50") ; DEUX séances dans la journée ; ou — si ce qui stagne est surtout dehors — le bouton Sortie ("pick":"sortie").
  · Si le rythme tient (on boucle à peu près autant qu'on dépose, les séances sont régulières) ET que rien de lourd n'attend dehors, reste sur la plus petite séance sensée.
- Constater honnêtement que ça s'accumule N'EST PAS stresser. Ce qui est interdit, c'est la culpabilité, le reproche et le décompte accusateur — pas le constat lucide. Une personne à qui on cache que le rythme décroche n'est pas rassurée, elle est abandonnée.
- INTENTION DE JOUR : un truc marqué « intention : prévu aujourd'hui » (ou passé) est un signal à peser avec le reste — conséquences, stagnation, fenêtre — pas une priorité absolue qui écrase tout. Si elle s'était donné un rendez-vous avec elle-même et que ça stagne, nomme-le et propose-le dans la composition du jour, sans reproche.
- FENÊTRES SAISONNIÈRES : certains trucs n'ont pas de date mais perdent leur sens passé un moment (organiser un voyage ou une activité d'été, un cadeau avant une fête, une inscription avant la rentrée). Déduis-le du texte et de la saison actuelle : si la fenêtre se referme bientôt, c'est le moment de le dire, même sans échéance saisie. Une envie douce (« aimerait essayer ce mois-ci ») n'est PAS une fenêtre qui se ferme — ne la transforme pas en deadline, et ne la mets jamais devant quelqu'un qui attend.
- TÂCHE AFFAMÉE : si un truc important est vieux et manifestement toujours doublé (déposé il y a longtemps, jamais avancé), tu peux soit le désigner comme LE pas à faire aujourd'hui dans une séance normale (lui donner de l'oxygène), soit — s'il a besoin d'un vrai bloc — OFFRIR un peu plus de temps. Toujours comme une option calme et bienveillante, jamais une pression ni un reproche de l'avoir laissé traîner.
- CONTEXTE : si un truc porte un « contexte » (enjeux, qui attend, intention douce, conséquence), tiens-en compte pour juger son importance et pour le formuler avec justesse (« ton père attend toujours ça »). Une intention douce (« aimerait cette semaine ») → un rappel léger si la semaine avance, jamais une urgence artificielle.
- NE RE-PROPOSE JAMAIS CE QUI VIENT D'ÊTRE FAIT. Si un truc porte une note indiquant qu'il a été fait / envoyé / relancé récemment (« relancé le 17/07, en attente de réponse »), NE suggère PAS de le refaire ni de le relancer. On ne relance un suivi que si son délai d'attente est réellement passé — un truc contacté aujourd'hui se laisse tranquille. Regarde les notes et les échéances avant de proposer quoi que ce soit.

PHILOSOPHIE DES ÉCHÉANCES (importante) : il n'y a jamais rien qu'on est OBLIGÉ de faire. Une échéance n'est pas une menace, c'est une FENÊTRE — une occasion disponible seulement un moment. Sois FACTUEL sur le timing (« c'est dans 2 jours », « la fenêtre est passée depuis 3 jours ») — n'adoucis jamais un vrai délai au point de le faire oublier — mais formule la suite comme une opportunité à saisir tant qu'elle est ouverte, jamais comme une obligation, jamais de culpabilité.
- LE CONTEXTE PRIME SUR LA DATE. Si le contexte d'un truc énonce une CONDITION (« dès réception du salaire », « quand j'aurai la réponse de X », « après mon rdv de jeudi »), c'est cette condition qui fait foi, pas la date portée par le truc. Tant qu'elle n'est pas remplie, le truc n'est PAS en retard, même si sa date est passée.
- NE PENSE PAS À VOIX HAUTE. Si tu repères une alerte puis que tu l'écartes, n'en parle tout simplement PAS. N'écris jamais « j'ai un truc qui clignote… mais en fait ce n'est pas encore l'heure », ni « c'est marqué en retard, or son contexte dit que non » : tu inquiètes puis tu détricotes, et il ne reste qu'une impression de désordre. Le tri se fait en silence ; on ne lit que ta conclusion.
- Quand la fenêtre est IMMINENTE (aujourd'hui ou demain), dis-le EXPLICITEMENT : « c'est aujourd'hui », « c'est demain ». Reste calme, mais net sur le JOUR — ne te contente jamais d'un vague « tant que c'est ouvert » pour une échéance du jour même, sinon on risque de la louper.

NE STRESSE JAMAIS (crucial) :
- Ne transforme JAMAIS le backlog en dette ni en champ de bataille. Bannis le décompte accusateur (« dix trucs en attente ! », « X en retard ») et l'énergie de combat (« il faut attaquer sérieusement »). Nommer une tendance reste permis, en mots et non en chiffres : « ça s'accumule un peu plus vite qu'on ne déblaie » plutôt que « tu as 20 trucs en retard ».
- Retourne l'agentivité : ce n'est pas la liste qui réclame la personne, c'est TOI qui la tiens pour elle. Ton de soulagement et de portage.
- PAS DE FAUSSE RÉASSURANCE. N'enchaîne jamais un constat avec un démenti creux (« il y a de quoi faire, MAIS rien d'écrasant », « c'est beaucoup mais t'inquiète ») : ça sonne faux et ça décrédibilise. La réassurance ne vient PAS de nier le volume, elle vient de deux choses concrètes : (1) tu tiens le reste pour elle, (2) tu ne proposes qu'un seul petit pas. Montre-le, ne le décrète pas.
- Donc : si c'est vraiment léger, dis-le simplement. S'il y a un peu à faire, reconnais-le honnêtement SANS le minimiser d'un « mais rien de grave » — et rassure en pointant le seul prochain pas et le fait que tu gardes le reste.
- Ne cite qu'UN truc concret ; ne récite pas la liste.

NATURE DES TRUCS — CE QU'ILS EXIGENT (crucial pour ne pas proposer l'absurde) :
- Une séance bureau = un moment guidé D'OÙ ELLE EST, en général assise, avec ce qu'elle a sous la main. Déduis de chaque truc, d'après son texte, ce qu'il exige VRAIMENT :
  · SOUS LA MAIN : un appel, un SMS, un mail, remplir un formulaire en ligne, une relance, démarrer un doc → ça rentre dans 5/15/30/50.
  · COURSE / SORTIE : aller à la poste, déposer un papier, faire un achat en magasin, un rdv sur place → ça EXIGE de sortir. Ça NE RENTRE PAS dans un créneau bureau. Ne promets JAMAIS de « l'attraper en quelques minutes » assis.
  · GROS BLOC / FOCUS : besoin d'ordi, de concentration, d'un vrai temps → un moment posé, pas entre deux.
- Le conseil du JOUR n'est pas prisonnier du bureau. Si ce qui pèse vraiment AUJOURD'HUI exige de sortir — quelqu'un attend, un papier urgent, plusieurs arrêts déjà couplés, un tas de sorties qui dorment depuis des semaines : le créneau à proposer EST une Sortie. "pick":"sortie". Nomme le bouton. « On le fera dans un créneau dédié plus tard » = les enterrer.
- Une envie douce (« aimerait essayer ce mois-ci ») ne passe PAS devant une conséquence réelle (un père qui attend, un papier).
- Si tu restes sur un créneau assis alors qu'une Sortie pèse : le pas assis peut ÊTRE la préparation (fichier sous la main, horaires d'ouverture) — ou tu proposes le bouton Sortie.
- Ne bourre jamais un 15 min assis avec une course dehors.

RÉGULIERS (fil conteneur — loyer, URSSAF, draps, tout ce qui REVIENT et que LA PERSONNE a choisi de retenir, jamais imposé) :
- Un régulier dont la fenêtre est ouverte peut entrer dans la composition du jour — pèse-le avec conséquences, stagnation, fit créneau. Pas de lane VIP.
- Formule « ça fait X semaines / un mois » — jamais « en retard ».
- Si aucun régulier n'est mûr, n'en parle pas dans le message.

RÉPONDS UNIQUEMENT avec un objet JSON, rien d'autre, de la forme exacte :
{"message": "...", "pick": "15"}
"pick" = "5"|"15"|"30"|"50"|"sortie".

SES TRUCS :
${render}

RÉGULIERS RETENUS :
${renderReguliersForPlan(allThreads)}

${renderStats(stats)}${chosenRule}`;
}

function regulierPlanPrompt(threads: Thread[], name?: string): string {
  const block = renderReguliersForPlan(threads);
  const empty = isReguliersListEmpty(threads);
  const modeBlock = empty
    ? REGULIERS_DISCOVERY_PROMPT
    : `${REGULIERS_FOCUS_PROMPT}
- Priorise les fenêtres ouvertes (mûres). S'il n'y en a pas de mûr, propose un régulier léger au choix — sans insister.
- PREMIER PASSAGE / « inscrit aujourd'hui » / « pas fait » = C'EST MÛR. La date du jour n'est pas une lessive déjà faite. Ne dis JAMAIS « vient d'être fait » / « rien de mûr » pour un régulier qu'on vient de retenir.
- UN régulier nommé dans le message ; pas de liste.`;

  return `${socle(name)}

LA PERSONNE VIENT DE CLIQUER « RÉGULIER ». Créneau pour ce qui revient — loyer, URSSAF, draps, appels réguliers… — seulement ce qu'ELLE a retenu (ou qu'on va retenir ensemble).

${block}

${modeBlock}

TON RÔLE : 1 à 2 phrases courtes, chaleureuses.
- pick = durée bureau ("5"|"15"|"30"|"50") — 15 par défaut.

RÉPONDS UNIQUEMENT avec : {"message": "...", "pick": "15"}`;
}

function systemPrompt(
  allThreads: Thread[],
  stats?: PlanStats,
  chosen?: number,
  name?: string,
  context?: SessionContext,
): string {
  const ctx = context ?? "desk";
  const open = openThreads(allThreads);
  if (ctx === "courses") return coursesPlanPrompt(open, name);
  if (ctx === "sortie") return sortiePlanPrompt(open, name);
  if (ctx === "regulier") return regulierPlanPrompt(allThreads, name);
  return deskPlanPrompt(open, allThreads, stats, chosen, name);
}

function fallbackPlan(
  context: SessionContext,
  threads: Thread[],
  chosen?: number,
): { message: string; pick: string } {
  if (context === "deposer") {
    return { message: DEPOSER_PLAN_MESSAGE, pick: "15" };
  }
  if (context === "courses") {
    const courses = findCoursesThread(openThreads(threads));
    if (courses?.note?.trim()) {
      const list = courses.note.trim();
      const preview =
        list.length > 180 ? `${list.slice(0, 180).trim()}…` : list;
      return {
        message: `Ta liste : ${preview}. On part là-dessus ?`,
        pick: "15",
      };
    }
    if (courses) {
      return {
        message:
          "Fil Courses ouvert mais liste vide — on la construit en séance, ou tu ajoutes ce qu'il te manque.",
        pick: "15",
      };
    }
    return {
      message:
        "Pas encore de fil Courses — en séance on peut créer la liste ensemble.",
      pick: "15",
    };
  }
  if (context === "sortie") {
    return {
      message:
        "On regarde ce qui se fait dehors sur ton trajet — poste, pharmacie, courses…",
      pick: "15",
    };
  }
  if (context === "regulier") {
    const due = reguliersDueFromThreads(threads);
    if (due.length > 0) {
      return {
        message: `${due[0].label} — ça fait un moment, on s'y met ?`,
        pick: "15",
      };
    }
    const container = findReguliersThread(openThreads(threads));
    const items = parseReguliers(container?.note);
    if (items.length > 0) {
      return {
        message: `Un tour tranquille — ${items[0].label}, ou autre chose si tu préfères.`,
        pick: "15",
      };
    }
    return {
      message:
        "Rien de retenu pour l'instant — loyer, URSSAF, draps… tu as des trucs qui reviennent ?",
      pick: "15",
    };
  }
  const minutes =
    chosen && [5, 15, 30, 50].includes(chosen) ? chosen : 15;
  return buildOfflinePlanHint(threads, minutes);
}

function notifyPlanPrompt(
  threads: Thread[],
  stats?: PlanStats,
  name?: string,
  chosen?: number,
  sourceMessage?: string,
): string {
  const chosenRule = chosen
    ? `\n\nDURÉE DÉJÀ CHOISIE : ${chosen} min — c'est le même conseil que sur l'accueil. Renvoie obligatoirement "pick":"${chosen}". Tu n'écris QUE le message court (max 90 car.), sans répéter la durée.`
    : "";
  const source = sourceMessage?.trim()
    ? `\n\nCONSEIL DÉJÀ COMPOSÉ (accueil et mail) :\n« ${sourceMessage.trim()} »\nTu RACCOURCIS ce conseil. MÊME truc. Tu n'en choisis pas un autre.`
    : "";
  return `${socle(name)}

${renderStats(stats)}

${renderLines(threads)}
${source}

TON RÔLE : rédiger le corps d'une NOTIFICATION PUSH du matin — pas le paragraphe conseil de l'accueil.

SORTIE JSON : "pick" ("5"|"15"|"30"|"50") + "message" (UNE phrase, max 90 caractères).${chosenRule}

RÈGLES NOTIF (non négociables) :
- La durée va dans le titre de l'app ("Élan · 30 min") — NE la répète PAS dans message (pas de « je te propose 30 min »).
- Pas de dates, échéances, comptages (« 23 trucs », « avant le 15/08 »), pas de culpabilité.
- Concret : UN truc ou intention, nommé simplement — le même que le conseil déjà composé, s'il est fourni.
- Ton : compagnon qui attend, chaleureux, léger — donne envie d'ouvrir, pas de pression.
- Pas de « Tap pour » ni consigne technique.

Exemples de message :
- « Planification voyage — j'ai une idée pour l'après-midi. »
- « Relance Paul — je prépare le brouillon mail. »
- « Rien qui presse. Un petit point quand tu veux ? »
- « Darty et la poste — on regarde ça ensemble ? »`;
}

function clipForNotify(message: string): string {
  const t = message.trim();
  if (t.length <= 90) return t;
  const cut = t.slice(0, 87);
  const i = cut.lastIndexOf(" ");
  return `${(i > 40 ? cut.slice(0, i) : cut).trim()}…`;
}

function fallbackNotifyPlan(
  threads: Thread[],
  sourceMessage?: string,
): { message: string; pick: string } {
  const source = sourceMessage?.trim();
  if (source) {
    return { message: clipForNotify(source), pick: "15" };
  }
  const open = openThreads(threads);
  if (open.length === 0) {
    return { message: "Rien qui presse. Un petit point quand tu veux ?", pick: "5" };
  }
  const label =
    open[0].text.length > 55
      ? `${open[0].text.slice(0, 54).trim()}…`
      : open[0].text;
  return { message: `${label} — on s'y met ?`, pick: "15" };
}

function cue(context?: SessionContext): string {
  if (context === "courses") {
    return "[J'ai choisi une séance COURSES au super. Conseille-moi sur ma liste, et propose un arrêt en plus seulement si un truc demande clairement de sortir. JSON seulement.]";
  }
  if (context === "sortie") {
    return "[J'ai choisi une séance SORTIE dehors. Regarde tous mes trucs, dis-moi ce qui se fait dehors — ignore le bureau. Tu peux inclure les courses si le fil existe. JSON seulement.]";
  }
  if (context === "regulier") {
    return "[J'ai choisi une séance RÉGULIER. Regarde UNIQUEMENT mes réguliers retenus — ou aide-moi à en retenir si la liste est vide. JSON seulement.]";
  }
  return "[Regarde mes trucs et conseille-moi la forme de ma journée. Réponds seulement avec le JSON demandé.]";
}

function safeParse(text: string): { message: string; pick: string } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (typeof o.message === "string" && typeof o.pick === "string") return o;
  } catch {
    // ignore
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = resolveAnthropicKey(req);
  if (!apiKey) return Response.json({ error: "no-key" }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const context = body.context ?? "desk";
  if (context === "deposer") {
    return Response.json({ message: DEPOSER_PLAN_MESSAGE, pick: "15" });
  }
  const open = (body.threads ?? []).filter((t) => t.status === "open");
  if (open.length === 0 && context !== "regulier") {
    return Response.json({ message: "", pick: "15" });
  }

  const client = new Anthropic({ apiKey });
  const forNotify = body.forNotify === true;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: forNotify ? 120 : 400,
      system: forNotify
        ? notifyPlanPrompt(
            open,
            body.stats,
            body.meta?.name,
            body.chosen,
            body.sourceMessage,
          )
        : systemPrompt(
            open,
            body.stats,
            body.chosen,
            body.meta?.name,
            context,
          ),
      messages: [
        {
          role: "user",
          content: forNotify
            ? "[Notif matin — JSON seulement, message max 90 caractères.]"
            : cue(context),
        },
      ],
    });
    const text =
      res.content.find((b) => b.type === "text")?.type === "text"
        ? (res.content.find((b) => b.type === "text") as { text: string }).text
        : "";
    const parsed = safeParse(text);
    const plan = parsed?.message.trim()
      ? parsed
      : forNotify
        ? fallbackNotifyPlan(open, body.sourceMessage)
        : fallbackPlan(context, open, body.chosen);
    let pick = ["5", "15", "30", "50", "sortie"].includes(plan.pick)
      ? plan.pick
      : "15";
    if (body.chosen && [5, 15, 30, 50].includes(body.chosen)) {
      pick = String(body.chosen);
    }
    return Response.json({ message: plan.message, pick });
  } catch (e) {
    console.error("[plan] échec:", e instanceof Error ? e.message : e);
    const plan = forNotify
      ? fallbackNotifyPlan(open, body.sourceMessage)
      : fallbackPlan(context, open, body.chosen);
    return Response.json({
      message: plan.message,
      pick: plan.pick,
      unreachable: true,
    });
  }
}
