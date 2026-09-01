/** Questionnaires produit progressifs — un à la fois, sans noyer. */

export type WtpAnswer = "yes" | "maybe" | "no";

export const WTP_DISMISS_KEY = "elan.survey.wtp.dismissed.v1";
export const WTP_ANSWERED_KEY = "elan.survey.wtp.answered.v1";

const WTP_MIN_SESSIONS = 2;

export function isWtpAnswered(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(WTP_ANSWERED_KEY) === "1";
}

export function markWtpAnswered(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(WTP_ANSWERED_KEY, "1");
}

export function isWtpDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(WTP_DISMISS_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { until?: number };
    return typeof j.until === "number" && Date.now() < j.until;
  } catch {
    return false;
  }
}

export function dismissWtpPrompt(days = 30): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    WTP_DISMISS_KEY,
    JSON.stringify({ until: Date.now() + days * 86_400_000 }),
  );
}

export function needsWtpSurvey(opts: {
  sessionsCount: number;
  modalShownThisVisit: boolean;
  acquisitionResolved: boolean;
}): boolean {
  if (!opts.acquisitionResolved) return false;
  if (opts.modalShownThisVisit) return false;
  if (opts.sessionsCount < WTP_MIN_SESSIONS) return false;
  if (isWtpAnswered()) return false;
  if (isWtpDismissed()) return false;
  return true;
}

export function wtpAnswerLabel(answer: WtpAnswer): string {
  if (answer === "yes") return "Oui";
  if (answer === "maybe") return "Peut-être";
  return "Non";
}

export function formatWtpFeedback(answer: WtpAnswer, detail?: string): string {
  const base = `[WTP 5€/mois] ${wtpAnswerLabel(answer)}`;
  const extra = detail?.trim();
  return extra ? `${base} — ${extra}` : base;
}
