import { apiFetch } from "./anthropic";
import type { AiPingStatus } from "./ai-ping-status";
import {
  clearByokFallback,
  markByokFallbackActive,
} from "./anthropic-key-client";
import { readAiDegraded } from "./ai-degraded-client";
import { reportAiFail, reportAiRecovered } from "./ai-fail-client";

let probeInflight: Promise<boolean> | null = null;
let lastProbeAt = 0;
const PROBE_COOLDOWN_MS = 30_000;

function applyPingStatus(j: AiPingStatus): boolean {
  if (j.fallbackToApp) {
    markByokFallbackActive();
    reportAiRecovered();
    return true;
  }
  if (j.ok) {
    clearByokFallback();
    reportAiRecovered();
    return true;
  }
  if (
    j.errorKind === "credits" ||
    j.errorKind === "quota" ||
    j.errorKind === "no_key"
  ) {
    reportAiFail(j.errorKind);
  }
  return false;
}

/** Vérifie si l'IA est joignable — appelé au chargement et après une erreur. */
export async function probeAiRecovery(opts?: {
  force?: boolean;
}): Promise<boolean> {
  const now = Date.now();
  if (probeInflight) return probeInflight;
  if (!opts?.force && now - lastProbeAt < PROBE_COOLDOWN_MS) {
    return !readAiDegraded();
  }

  probeInflight = (async () => {
    lastProbeAt = Date.now();
    try {
      const res = await apiFetch("/api/ai/ping", { method: "POST" });
      if (!res.ok) return false;
      const j = (await res.json()) as AiPingStatus;
      return applyPingStatus(j);
    } catch {
      return false;
    } finally {
      probeInflight = null;
    }
  })();

  return probeInflight;
}

/** Vérifie d'abord si l'IA répond — évite un bandeau périmé. */
export async function reportAiFailUnlessRecovered(
  kind: AnthropicFailKind | null | undefined,
): Promise<boolean> {
  if (!kind) return false;
  const recovered = await probeAiRecovery({ force: true });
  if (recovered) return true;
  reportAiFail(kind);
  return false;
}
