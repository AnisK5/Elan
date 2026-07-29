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
  snoozedUntil?: string; // ISO date — CACHE le truc jusqu'à cette date
  // ISO date — jour où on a prévu de s'en occuper. L'inverse de snoozedUntil :
  // ça ne cache rien, ça FAIT REMONTER le truc le jour dit.
  plannedFor?: string;
  projectId?: string; // rattachement facultatif à un projet
}

// Le "projet" : un chantier plus gros que le truc (« Dvp de l'app », « Postuler »).
// Optionnel — les trucs vivent très bien sans. Sert à la vue temporelle de la
// semaine : l'IA raisonne sur l'ORDRE et les DÉPENDANCES entre projets.
export type ProjectStatus = "active" | "paused" | "done";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string; // ISO
  goal?: string; // à quoi ça sert / pourquoi ça compte (nourrit le raisonnement)
  dependsOn?: string[]; // ids des projets à faire avancer avant celui-ci
  due?: string; // échéance globale éventuelle (ISO)
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
