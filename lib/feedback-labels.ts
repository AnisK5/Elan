const MOOD_LABELS: Record<string, string> = {
  up: "👍",
  down: "👎",
  bien: "Ça va",
  bof: "Bof",
  bloque: "Bloqué",
};

const SOURCE_LABELS: Record<string, string> = {
  settings: "Réglages",
  wrap_up: "Fin de séance",
  home: "Aide",
  survey_wtp: "Sondage prix",
};

export function formatFeedbackMood(mood: string | null): string | null {
  if (!mood) return null;
  return MOOD_LABELS[mood] ?? mood;
}

export function formatFeedbackSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
