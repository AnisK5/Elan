/** Tarifs Anthropic (USD / million de tokens) — estimation, pas facture réelle. */

export interface ModelPricing {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
  "claude-opus-4-8": { inputPerMTokUsd: 15, outputPerMTokUsd: 75 },
  "claude-haiku-4-5": { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
};

export function usdToEurRate(): number {
  const raw = process.env.ELAN_USD_EUR;
  const n = raw ? Number.parseFloat(raw) : 0.92;
  return Number.isFinite(n) && n > 0 ? n : 0.92;
}

export function resolveModelPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return MODEL_PRICING["claude-haiku-4-5"];
  if (lower.includes("opus")) return MODEL_PRICING["claude-opus-4-8"];
  return MODEL_PRICING["claude-sonnet-4-6"];
}

export function estimateUsageCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = resolveModelPricing(model);
  return (
    (inputTokens * p.inputPerMTokUsd + outputTokens * p.outputPerMTokUsd) /
    1_000_000
  );
}

export function estimateUsageCostEur(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  return estimateUsageCostUsd(model, inputTokens, outputTokens) * usdToEurRate();
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount < 1 ? 2 : 2,
    maximumFractionDigits: amount < 1 ? 2 : 2,
  }).format(amount);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount < 1 ? 2 : 2,
    maximumFractionDigits: amount < 1 ? 2 : 2,
  }).format(amount);
}

/** Estimation quand on n'a que le total (ex. plafond journalier). Répartition 50/50 in/out, Sonnet. */
export function estimateEurFromTotalTokens(totalTokens: number): number {
  if (totalTokens <= 0) return 0;
  const half = totalTokens / 2;
  return estimateUsageCostEur("claude-sonnet-4-6", half, half);
}
