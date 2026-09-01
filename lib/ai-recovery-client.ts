import { apiFetch, looksLikeAnthropicKey, readUserAnthropicKey } from "./anthropic";
import type { AiPingStatus } from "./ai-ping-status";
import {
  clearByokFallback,
  markByokFallbackActive,
} from "./anthropic-key-client";
import { reportAiFail, reportAiRecovered } from "./ai-fail-client";
import { readAiDegraded } from "./ai-degraded-client";

let probeInflight: Promise<boolean> | null = null;
let lastProbeAt = 0;
const PROBE_COOLDOWN_MS = 60_000;

function shouldProbe(): boolean {
  return (
    Boolean(readAiDegraded()) ||
    looksLikeAnthropicKey(readUserAnthropicKey())
  );
}

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
  if (j.errorKind === "credits" || j.errorKind === "quota" || j.errorKind === "no_key") {
    reportAiFail(j.errorKind);
  }
  return false;
}

/** Vérifie si l'IA est de nouveau joignable (crédits rechargés, repli clé app, etc.). */
export async function probeAiRecovery(opts?: {
  force?: boolean;
}): Promise<boolean> {
  if (!shouldProbe()) return true;

  const now = Date.now();
  if (probeInflight) return probeInflight;
  if (!opts?.force && now - lastProbeAt < PROBE_COOLDOWN_MS) return false;

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
