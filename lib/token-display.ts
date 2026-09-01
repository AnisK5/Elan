import {
  estimateEurFromTotalTokens,
  formatEur,
} from "./anthropic-pricing";
import { isUnlimitedSharedTokenLimit } from "./app-config";

export function formatTokenCount(tokens: number): string {
  return `${tokens.toLocaleString("fr-FR")} tok`;
}

export function formatTokensWithEur(
  tokens: number,
  costEur?: number,
): string {
  const eur =
    costEur != null && costEur > 0
      ? costEur
      : tokens > 0
        ? estimateEurFromTotalTokens(tokens)
        : 0;
  if (tokens <= 0 && eur <= 0) return "—";
  if (tokens <= 0) return formatEur(eur);
  if (eur <= 0) return formatTokenCount(tokens);
  return `${formatTokenCount(tokens)} · ${formatEur(eur)}`;
}

/** Affichage quota : 0 tok explicite au lieu de « — ». */
export function formatQuotaUsage(tokens: number, costEur?: number): string {
  if (tokens <= 0) {
    return costEur != null && costEur > 0
      ? `0 tok · ${formatEur(costEur)}`
      : "0 tok";
  }
  return formatTokensWithEur(tokens, costEur);
}

export function formatSharedTokenLimitWithEur(limit: number): string {
  if (isUnlimitedSharedTokenLimit(limit)) return "Illimité";
  return formatTokensWithEur(limit);
}
