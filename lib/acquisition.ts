export const ACQUISITION_STORAGE_KEY = "elan.acquisition.v1";
export const ACQUISITION_DISMISS_KEY = "elan.acquisition.dismissed.v1";

export interface AcquisitionAttribution {
  ref?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  landingPath?: string;
  capturedAt?: string;
}

export interface AcquisitionSurvey {
  channel: string;
  detail?: string;
  answeredAt: string;
}

export interface AcquisitionInfo {
  attribution?: AcquisitionAttribution;
  survey?: AcquisitionSurvey;
}

export const ACQUISITION_CHANNELS = [
  { id: "word_of_mouth", label: "Bouche-à-oreille" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "google", label: "Recherche Google" },
  { id: "other", label: "Autre" },
] as const;

export function captureAcquisitionFromUrl(
  search = typeof window !== "undefined" ? window.location.search : "",
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
): AcquisitionAttribution | null {
  const params = new URLSearchParams(search);
  const ref = params.get("ref") ?? undefined;
  const source = params.get("source") ?? params.get("src") ?? undefined;
  const utmSource = params.get("utm_source") ?? undefined;
  const utmMedium = params.get("utm_medium") ?? undefined;
  const utmCampaign = params.get("utm_campaign") ?? undefined;
  const utmContent = params.get("utm_content") ?? undefined;

  if (!ref && !source && !utmSource && !utmMedium && !utmCampaign && !utmContent) {
    return readStoredAttribution();
  }

  const attribution: AcquisitionAttribution = {
    ref,
    source,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    landingPath: pathname,
    capturedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    sessionStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(attribution));
  }
  return attribution;
}

export function readStoredAttribution(): AcquisitionAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACQUISITION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AcquisitionAttribution) : null;
  } catch {
    return null;
  }
}

export function buildSignupMeta(
  attribution?: AcquisitionAttribution | null,
  authProvider?: string,
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (authProvider) meta.authProvider = authProvider;
  if (attribution?.ref) meta.ref = attribution.ref;
  if (attribution?.source) meta.source = attribution.source;
  if (attribution?.utmSource) meta.utmSource = attribution.utmSource;
  if (attribution?.utmMedium) meta.utmMedium = attribution.utmMedium;
  if (attribution?.utmCampaign) meta.utmCampaign = attribution.utmCampaign;
  if (attribution?.utmContent) meta.utmContent = attribution.utmContent;
  if (attribution?.landingPath) meta.landingPath = attribution.landingPath;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function formatAcquisitionLabel(info?: AcquisitionInfo | null): string {
  if (!info) return "—";
  if (info.survey?.channel) {
    const known = ACQUISITION_CHANNELS.find((c) => c.id === info.survey?.channel);
    const base = known?.label ?? info.survey.channel;
    return info.survey.detail ? `${base} — ${info.survey.detail}` : base;
  }
  const a = info.attribution;
  if (!a) return "—";
  if (a.ref) return `ref: ${a.ref}`;
  if (a.source) return a.source;
  if (a.utmSource) {
    return [a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(" / ");
  }
  return "—";
}

export function isAcquisitionPromptDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(ACQUISITION_DISMISS_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { until?: number };
    return typeof j.until === "number" && Date.now() < j.until;
  } catch {
    return false;
  }
}

export function dismissAcquisitionPrompt(days = 90): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    ACQUISITION_DISMISS_KEY,
    JSON.stringify({ until: Date.now() + days * 86_400_000 }),
  );
}

export function needsAcquisitionPrompt(info?: AcquisitionInfo | null): boolean {
  if (info?.survey?.channel) return false;
  if (isAcquisitionPromptDismissed()) return false;
  return true;
}

/** Questionnaire répondu ou reporté — on peut proposer PWA / notifs. */
export function isAcquisitionResolved(info?: AcquisitionInfo | null): boolean {
  if (info?.survey?.channel) return true;
  return isAcquisitionPromptDismissed();
}

function pickSurvey(
  local?: AcquisitionSurvey,
  remote?: AcquisitionSurvey,
): AcquisitionSurvey | undefined {
  if (local?.channel && remote?.channel) {
    const localAt = Date.parse(local.answeredAt);
    const remoteAt = Date.parse(remote.answeredAt);
    return localAt >= remoteAt ? local : remote;
  }
  return local?.channel ? local : remote?.channel ? remote : undefined;
}

/** Fusionne local + remote — ne perd jamais une réponse questionnaire. */
export function mergeAcquisition(
  local?: AcquisitionInfo | null,
  remote?: AcquisitionInfo | null,
): AcquisitionInfo | undefined {
  const survey = pickSurvey(local?.survey, remote?.survey);
  const attribution = {
    ...local?.attribution,
    ...remote?.attribution,
  };
  const hasAttr = Object.keys(attribution).some(
    (k) => attribution[k as keyof AcquisitionAttribution],
  );
  if (!survey && !hasAttr) return undefined;
  return {
    ...(hasAttr ? { attribution } : {}),
    ...(survey ? { survey } : {}),
  };
}
