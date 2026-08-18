import type { ChatMessage, Thread } from "@/lib/types";
import type { ThreadOp } from "@/lib/store";
import {
  findReguliersThread,
  isReguliersContainerName,
  parseReguliers,
  REGULIERS_THREAD_TEXT,
  serializeReguliers,
  type RegulierItem,
} from "@/lib/entretiens";

const HABITS: { label: string; re: RegExp }[] = [
  {
    label: "linge de lit",
    re: /linge\s+de\s+(?:mon\s+|ton\s+|le\s+|mes\s+|tes\s+)?lit|draps?\b|housses?\s+de\s+couette/i,
  },
  { label: "loyer", re: /\bloyer\b/i },
  { label: "URSSAF", re: /\burssaf\b/i },
  { label: "frigo", re: /\bfrigos?\b|réfrigérateur/i },
];

function isoDayParis(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function inferCadence(text: string): string | null {
  if (
    /semaine et demie|1\s*semaine\s*et\s*demie|1[,.]5\s*sem|1\s*(?:à|ou|-)\s*2\s*sem|toutes les deux semaines|toutes les 2 semaines|tous les 15 jours|~2\s*sem/i.test(
      text,
    )
  ) {
    return "~2sem";
  }
  const nSem = text.match(/toutes les (\d+)\s*semaines/i);
  if (nSem) return `~${nSem[1]}sem`;
  if (
    /toutes les semaines|chaque semaine|une fois par semaine|~1\s*sem/i.test(
      text,
    )
  ) {
    return "~1sem";
  }
  if (/tous les mois|chaque mois|une fois par mois|~1\s*mois/i.test(text)) {
    return "~1mois";
  }
  const nJ = text.match(/tous les (\d+)\s*jours/i);
  if (nJ) return `~${nJ[1]}j`;
  return null;
}

function userRefused(messages: Pick<ChatMessage, "role" | "content">[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return false;
  return /^(non|nan|laisse(?:\s+tomber)?|pas maintenant|oublie|annule)[\s.!?]*$/i.test(
    last.content.trim(),
  );
}

/** Lit l'échange et en tire les réguliers confirmés — sans passer par le modèle. */
export function extractReguliersFromConvo(
  messages: Pick<ChatMessage, "role" | "content">[],
  at = new Date(),
): RegulierItem[] {
  const recent = messages.slice(-12);
  if (recent.length === 0 || userRefused(recent)) return [];

  const blob = recent.map((m) => m.content).join("\n");
  const cadence = inferCadence(blob);
  if (!cadence) return [];

  const lastDone = isoDayParis(at);
  const items: RegulierItem[] = [];
  for (const habit of HABITS) {
    if (!habit.re.test(blob)) continue;
    items.push({ label: habit.label, cadence, lastDone });
  }
  return items;
}

export function upsertRegulierOps(
  threads: Thread[],
  incoming: RegulierItem[],
): ThreadOp[] {
  if (incoming.length === 0) return [];

  const container = findReguliersThread(threads);
  const existing = parseReguliers(container?.note);
  const next = [...existing];
  let changed = false;

  for (const item of incoming) {
    const i = next.findIndex(
      (it) => it.label.trim().toLowerCase() === item.label.trim().toLowerCase(),
    );
    if (i < 0) {
      next.push(item);
      changed = true;
      continue;
    }
    if (next[i].cadence !== item.cadence) {
      next[i] = { ...next[i], cadence: item.cadence };
      changed = true;
    }
  }

  if (!changed) return [];

  const note = serializeReguliers(next);
  if (container) {
    return [{ op: "note", id: container.id, note }];
  }
  return [
    {
      op: "add",
      text: REGULIERS_THREAD_TEXT,
      kind: "action",
      note,
    },
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Greffier + écriture code : le code gagne sur le conteneur Réguliers. */
export function mergeRegulierWrites(
  threads: Thread[],
  messages: Pick<ChatMessage, "role" | "content">[],
  greffierUpdates: unknown[],
  at = new Date(),
): unknown[] {
  const items = extractReguliersFromConvo(messages, at);
  const ours = upsertRegulierOps(threads, items);
  const greffier = Array.isArray(greffierUpdates) ? greffierUpdates : [];
  if (ours.length === 0) return greffier;

  const containerIds = new Set(
    threads.filter((t) => isReguliersContainerName(t.text)).map((t) => t.id),
  );
  const labels = new Set(items.map((it) => it.label.toLowerCase()));
  const filtered = greffier.filter((raw) => {
    if (!isRecord(raw)) return true;
    if (raw.op === "add" && typeof raw.text === "string") {
      const text = raw.text.trim().toLowerCase();
      if (isReguliersContainerName(raw.text)) return false;
      if (labels.has(text)) return false;
    }
    if (
      raw.op === "note" &&
      typeof raw.id === "string" &&
      containerIds.has(raw.id)
    ) {
      return false;
    }
    return true;
  });
  return [...filtered, ...ours];
}

export function reguliersWriteNote(ops: ThreadOp[]): string {
  const add = ops.find((op) => op.op === "add");
  const note = add?.op === "add" ? add.note : ops.find((op) => op.op === "note")?.note;
  if (!note) return "régulier retenu";
  const first = parseReguliers(note)[0];
  return first ? `${first.label} · dans Réguliers` : "régulier retenu";
}
