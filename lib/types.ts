// Le "fil" : une chose qui traîne dans ta tête. Capturé sans friction,
// enrichi seulement si tu en as l'envie. L'IA se débrouille avec le reste.

export type ThreadKind = "action" | "suivi"; // à faire soi-même | à surveiller/relancer
export type Effort = "S" | "M" | "L"; // petite / moyenne / grosse bouchée
export type Energy = "basse" | "moyenne" | "haute";
export type ThreadStatus = "open" | "done" | "snoozed";

export interface Thread {
  id: string;
  text: string;
  kind: ThreadKind;
  status: ThreadStatus;
  createdAt: string; // ISO
  due?: string; // ISO date (jour)
  effort?: Effort;
  energy?: Energy;
  note?: string;
  touchedAt?: string; // dernière fois travaillé en séance
  snoozedUntil?: string; // ISO date
}

export type Role = "assistant" | "user";

export interface ChatMessage {
  role: Role;
  content: string;
  at?: string; // ISO — horodatage du message
}

export interface SessionLog {
  id: string;
  date: string; // ISO
  durationMin: number;
  transcript: ChatMessage[];
}

export interface Settings {
  defaultDurationMin: number;
  name?: string;
}
