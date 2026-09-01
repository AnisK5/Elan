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

export function formatSharedTokenLimitWithEur(limit: number): string {
  if (isUnlimitedSharedTokenLimit(limit)) return "Illimité";
  return formatTokensWithEur(limit);
}
