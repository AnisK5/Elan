import type { ChatMessage, Thread } from "@/lib/types";
import type { ThreadOp } from "@/lib/store";
import { needsPurchaseStep, hasPendingPhysicalWork } from "@/lib/plan-candidates";

export const COURSES_THREAD_TEXT = "Courses";

export function findCoursesThread(threads: Thread[]): Thread | undefined {
  return threads.find(
    (t) =>
      t.status === "open" && t.text.trim().toLowerCase() === "courses",
  );
}

function coursesNoteItems(note?: string): string[] {
  if (!note?.trim()) return [];
  return note
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeCoursesNote(prev: string | undefined, items: string[]): string {
  const existing = coursesNoteItems(prev);
  const seen = new Set(existing.map((i) => i.toLowerCase()));
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    existing.push(item);
    seen.add(key);
  }
  return existing.join(" · ");
}

/** Libellé court pour le fil Courses à partir d'un truc qui demande un achat. */
export function itemLabelForCourses(t: Thread): string | null {
  if (!needsPurchaseStep(t.text, t.note)) return null;
  const blob = `${t.text}\n${t.note ?? ""}`;
  if (/patins?(?:\s+(?:des?\s+)?chaises?)?/i.test(blob)) return "patins chaises";
  if (/ampoules?/i.test(blob)) return "ampoules";
  if (/lessive/i.test(blob)) return "lessive";
  const buy = blob.match(
    /(?:à acheter|acheter)\s*[:\-—]?\s*([^.·\n]{2,40})/i,
  );
  if (buy?.[1]) return buy[1].trim();
  const short = t.text.trim();
  return short.length <= 32 ? short : `${short.slice(0, 30).trim()}…`;
}

export function upsertCoursesOps(
  threads: Thread[],
  items: string[],
): ThreadOp[] {
  const unique = [
    ...new Set(items.map((i) => i.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];

  const courses = findCoursesThread(threads);
  if (courses) {
    const note = mergeCoursesNote(courses.note, unique);
    if (note === (courses.note ?? "").trim()) return [];
    return [{ op: "note", id: courses.id, note }];
  }
  return [
    {
      op: "add",
      text: COURSES_THREAD_TEXT,
      kind: "action",
      note: unique.join(" · "),
    },
  ];
}

export function extractShoppingFromThreads(threads: Thread[]): string[] {
  return threads
    .filter((t) => t.status === "open")
    .map(itemLabelForCourses)
    .filter((x): x is string => Boolean(x));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function resolveOpThreadId(
  raw: unknown,
  threads: Thread[],
): Thread | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string") return undefined;
  const id = raw.id.trim();
  return (
    threads.find((t) => t.id === id) ??
    threads.find(
      (t) =>
        t.status === "open" &&
        t.text.trim().toLowerCase().includes(id.toLowerCase()),
    )
  );
}

/** Greffier : pas de "done" tant qu'il faut acheter / récupérer. */
export function mergeShoppingWrites(
  threads: Thread[],
  _messages: Pick<ChatMessage, "role" | "content">[],
  greffierUpdates: unknown[],
): unknown[] {
  const greffier = Array.isArray(greffierUpdates) ? greffierUpdates : [];
  return greffier.filter((raw) => {
    if (!isRecord(raw) || raw.op !== "done") return true;
    const t = resolveOpThreadId(raw, threads);
    if (!t) return true;
    return !hasPendingPhysicalWork(t.text, t.note);
  });
}

function threadsAfterNoteOps(threads: Thread[], ops: unknown[]): Thread[] {
  const next = threads.map((t) => ({ ...t }));
  for (const raw of ops) {
    if (!isRecord(raw) || raw.op !== "note" || typeof raw.note !== "string") {
      continue;
    }
    const id = typeof raw.id === "string" ? raw.id : "";
    const t = next.find((x) => x.id === id);
    if (t) t.note = raw.note;
  }
  return next;
}

export function shoppingOpsForThreads(
  threads: Thread[],
  greffierUpdates: unknown[],
): ThreadOp[] {
  const filtered = mergeShoppingWrites(threads, [], greffierUpdates);
  const preview = threadsAfterNoteOps(threads, filtered);
  return upsertCoursesOps(preview, extractShoppingFromThreads(preview));
}

export function shoppingWriteNote(ops: ThreadOp[]): string {
  const add = ops.find((op) => op.op === "add");
  if (add?.op === "add" && add.text.toLowerCase() === "courses") {
    return "Courses";
  }
  const note = ops.find((op) => op.op === "note");
  if (note?.op === "note") {
    const first = coursesNoteItems(note.note)[0];
    return first ? `${first} · Courses` : "Courses";
  }
  return "Courses";
}
