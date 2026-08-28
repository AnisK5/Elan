import type { Settings } from "./types";
import type { AcquisitionInfo } from "./acquisition";
import { isNotifyPromptDismissed } from "./notifications";
import { isAcquisitionResolved as acquisitionGateOpen } from "./acquisition";

export type EngagementPromptKind = "pwa" | "notify";

export const PWA_PROMPT_DISMISS_KEY = "elan.engagement.pwaDismissed.v1";
export const MODAL_THIS_VISIT_KEY = "elan.modals.thisVisit.v1";

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isPwaPromptDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(PWA_PROMPT_DISMISS_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { until?: number };
    return typeof j.until === "number" && Date.now() < j.until;
  } catch {
    return false;
  }
}

export function dismissPwaPrompt(days = 14): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    PWA_PROMPT_DISMISS_KEY,
    JSON.stringify({ until: Date.now() + days * 86_400_000 }),
  );
}

export function wasModalShownThisVisit(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(MODAL_THIS_VISIT_KEY) === "1";
}

export function markModalShownThisVisit(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(MODAL_THIS_VISIT_KEY, "1");
}

export function hasMeaningfulEngagement(
  sessionsCount: number,
  threadsCount: number,
): boolean {
  return sessionsCount >= 1 || threadsCount >= 2;
}

export function isNotifySetupComplete(
  settings: Settings,
  opts?: { pushReady?: boolean; hasPushSub?: boolean | null },
): boolean {
  if (!settings.notifyEnabled) return false;
  if (!opts?.pushReady) return true;
  return opts.hasPushSub === true;
}

export function resolveEngagementPrompt(opts: {
  acquisition?: AcquisitionInfo | null;
  modalShownThisVisit: boolean;
  sessionsCount: number;
  threadsCount: number;
  settings: Settings;
  pushReady?: boolean;
  hasPushSub?: boolean | null;
}): EngagementPromptKind | null {
  if (!acquisitionGateOpen(opts.acquisition)) return null;
  if (opts.modalShownThisVisit) return null;
  if (
    !hasMeaningfulEngagement(opts.sessionsCount, opts.threadsCount)
  ) {
    return null;
  }

  if (!isAppInstalled() && !isPwaPromptDismissed()) {
    return "pwa";
  }

  if (
    !isNotifySetupComplete(opts.settings, {
      pushReady: opts.pushReady,
      hasPushSub: opts.hasPushSub,
    }) &&
    !isNotifyPromptDismissed()
  ) {
    return "notify";
  }

  return null;
}
