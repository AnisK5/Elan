import { apiFetch } from "./anthropic";
import type { AnthropicFailKind } from "./anthropic";
import { reportAiFail, reportAiRecovered } from "./ai-fail-client";
import { readAiDegraded } from "./ai-degraded-client";

let probeInflight: Promise<boolean> | null = null;
let lastProbeAt = 0;
const PROBE_COOLDOWN_MS = 60_000;

/** Vérifie si l'IA est de nouveau joignable (crédits rechargés, etc.). */
export async function probeAiRecovery(opts?: {
  force?: boolean;
}): Promise<boolean> {
  if (!readAiDegraded()) return true;

  const now = Date.now();
  if (probeInflight) return probeInflight;
  if (!opts?.force && now - lastProbeAt < PROBE_COOLDOWN_MS) return false;

  probeInflight = (async () => {
    lastProbeAt = Date.now();
    try {
      const res = await apiFetch("/api/ai/ping", { method: "POST" });
      if (!res.ok) return false;
      const j = (await res.json()) as {
        ok?: boolean;
        errorKind?: AnthropicFailKind;
      };
      if (j.ok) {
        reportAiRecovered();
        return true;
      }
      if (j.errorKind === "credits" || j.errorKind === "quota") {
        reportAiFail(j.errorKind);
      }
      return false;
    } catch {
      return false;
    } finally {
      probeInflight = null;
    }
  })();

  return probeInflight;
}
