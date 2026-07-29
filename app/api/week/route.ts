import Anthropic from "@anthropic-ai/sdk";
import type { Project, Thread } from "@/lib/types";
import {
  ALL_SLOTS,
  DAY_KEYS,
  PARTS,
  todayDayIdx,
  type WeekSlot,
} from "@/lib/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  projects: Project[];
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
  if (n < 0) return ` · échéance dépassée depuis ${-n}j`;
  if (n === 0) return " · échéance aujourd'hui";
  if (n === 1) return " · échéance demain";
  return ` · échéance dans ${n}j`;
}

function renderProjects(projects: Project[], threads: Thread[]): string {
  const active = projects.filter((p) => p.status === "active");
  if (active.length === 0) return "Aucun projet actif.";
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  return active
    .map((p) => {
      const goal = p.goal ? `\n    but : ${p.goal}` : "";
      const deps = (p.dependsOn ?? [])
        .map((id) => nameById.get(id))
        .filter(Boolean);
      const depLine = deps.length
        ? `\n    dépend de : ${deps.join(", ")} (à faire avancer avant)`
        : "";
      const open = threads.filter(
        (t) => t.projectId === p.id && t.status === "open",
      );
      const trucs = open.length
        ? `\n    trucs ouverts : ${open.map((t) => t.text).join(" ; ")}`
        : "";
      return `- ${p.name}${dueLabel(p.due)}${goal}${depLine}${trucs}`;
    })
    .join("\n");
}

// Trucs ouverts non rattachés à un projet — utiles à placer aussi.
function renderLooseThreads(projects: Project[], threads: Thread[]): string {
  const ids = new Set(projects.map((p) => p.id));
  const loose = threads.filter(
    (t) =>
      t.status === "open" && (!t.projectId || !ids.has(t.projectId)),
  );
  if (loose.length === 0) return "";
  const lines = loose
    .slice(0, 12)
    .map((t) => `- ${t.text}${dueLabel(t.due)}`)
    .join("\n");
  return `\n\nTRUCS OUVERTS SANS PROJET (tu peux les glisser dans un créneau si pertinent) :\n${lines}`;
}

function systemPrompt(projects: Project[], threads: Thread[], name?: string) {
  const who = name ? ` La personne s'appelle ${name}.` : "";
  const now = new Date();
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const idx = todayDayIdx();
  const remaining = DAY_KEYS.slice(idx); // du jour courant à dimanche
  const remainingSlots = remaining.flatMap((d) =>
    PARTS.map((p) => `${d}-${p}`),
  );

  return `Tu es le planificateur de semaine d'Élan, pour une personne TDAH.${who}

NOUS SOMMES ${today}. On raisonne sur la SEMAINE EN COURS, du jour présent jusqu'à dimanche. Ne place JAMAIS rien dans un jour déjà passé.

TON RÔLE : la personne est en cécité temporelle — elle n'arrive pas à se REPRÉSENTER la forme de sa semaine ni l'ORDRE dans lequel avancer ses projets. Tu fais ce travail pour elle : tu proposes dans quel créneau faire avancer quel projet, dans un ordre RÉFLÉCHI, en expliquant le POURQUOI de l'ordre.

LE CŒUR DU TRAVAIL — L'ORDRE ET LES DÉPENDANCES :
- Sers-toi des dépendances déclarées ET du bon sens : si un projet en débloque un autre, place-le AVANT (« on avance l'app lundi matin parce qu'elle sert à postuler l'aprem »).
- Pense aux temps morts utiles : si une action déclenche une attente (une réponse, un retour), place autre chose pendant ce délai (« on envoie les candidatures lundi, donc mardi on laisse respirer et on avance un autre front le temps que les réponses arrivent »).
- Tiens compte des échéances : ce qui a une fenêtre qui se ferme passe plus tôt.
- LA RAISON EST LE PRODUIT. Chaque créneau placé DOIT porter une raison courte et concrète qui aide la personne à comprendre l'ordre. Un créneau sans « parce que » ne sert à rien.

RÈGLES D'OR (sinon on retombe dans l'agenda culpabilisant) :
- CLAIRSEMÉ. Tu laisses BEAUCOUP de blanc. Ne remplis JAMAIS tous les créneaux : place seulement les moments qui comptent vraiment (en général 3 à 7 créneaux sur la semaine, souvent moins). Un planning plein est faux et écrasant.
- UN SEUL projet par créneau. Pas d'empilement.
- Rythme humain : prévois des respirations, ne colle pas 3 gros blocs le même jour.
- Zéro culpabilité, zéro pression, zéro langage de retard. C'est une proposition pour s'orienter, pas un contrat.
- Ton : chaleureux, direct, court, tutoiement. Pas de markdown, pas d'émoji.

CRÉNEAUX VALIDES (clé exacte à utiliser dans "slot") — uniquement du jour présent à dimanche :
${remainingSlots.join(", ")}

RÉPONDS UNIQUEMENT avec un objet JSON, rien d'autre, de la forme exacte :
{"intro": "1 à 2 phrases qui donnent la logique d'ensemble de la semaine", "slots": [{"slot": "lun-matin", "projectId": "<id du projet>", "rationale": "parce que…"}]}

Le champ "projectId" doit être l'id EXACT d'un projet ci-dessous (ou l'id d'un truc sans projet). N'invente aucun id.

PROJETS ACTIFS :
${renderProjects(projects, threads)}${renderLooseThreads(projects, threads)}`;
}

const CUE =
  "[Regarde mes projets et propose-moi la forme de ma semaine : quel projet avancer dans quel créneau, dans un ordre réfléchi, avec le pourquoi. Réponds seulement avec le JSON demandé.]";

function safeParse(
  text: string,
): { intro: string; slots: WeekSlot[] } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (typeof o.intro === "string" && Array.isArray(o.slots)) {
      return o as { intro: string; slots: WeekSlot[] };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "no-key" }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const projects = (body.projects ?? []).filter((p) => p.status === "active");
  const threads = body.threads ?? [];
  if (projects.length === 0) {
    return Response.json({ intro: "", slots: [] });
  }

  const validIds = new Set<string>([
    ...projects.map((p) => p.id),
    ...threads.filter((t) => t.status === "open").map((t) => t.id),
  ]);
  const idx = todayDayIdx();
  const allowedSlots = new Set(
    DAY_KEYS.slice(idx).flatMap((d) => PARTS.map((p) => `${d}-${p}`)),
  );

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1200,
      system: systemPrompt(projects, threads, body.meta?.name),
      messages: [{ role: "user", content: CUE }],
    });
    const text =
      res.content.find((b) => b.type === "text")?.type === "text"
        ? (res.content.find((b) => b.type === "text") as { text: string }).text
        : "";
    const parsed = safeParse(text);
    if (!parsed) return Response.json({ intro: "", slots: [] });

    // On ne garde que des créneaux valides, non passés, avec un id connu.
    const slots = parsed.slots
      .filter(
        (s) =>
          s &&
          typeof s.slot === "string" &&
          ALL_SLOTS.has(s.slot) &&
          allowedSlots.has(s.slot) &&
          validIds.has(s.projectId) &&
          typeof s.rationale === "string",
      )
      .map((s) => ({
        slot: s.slot,
        projectId: s.projectId,
        rationale: s.rationale.trim(),
      }));

    return Response.json({ intro: parsed.intro.trim(), slots });
  } catch {
    return Response.json({ intro: "", slots: [] });
  }
}
