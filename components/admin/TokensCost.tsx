import { formatEur } from "@/lib/anthropic-pricing";
import { formatTokenCount } from "@/lib/token-display";

export default function TokensCost({
  tokens,
  costEur,
  stack = false,
  className = "",
}: {
  tokens: number;
  costEur: number;
  stack?: boolean;
  className?: string;
}) {
  if (tokens <= 0 && costEur <= 0) {
    return <span className={className}>—</span>;
  }

  if (stack) {
    return (
      <span className={className}>
        {tokens > 0 ? (
          <span className="tabular-nums text-ink">
            {tokens.toLocaleString("fr-FR")}
          </span>
        ) : null}
        {costEur > 0 ? (
          <span className="mt-0.5 block text-[10px] tabular-nums text-faint">
            {formatEur(costEur)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {tokens > 0 ? formatTokenCount(tokens) : null}
      {tokens > 0 && costEur > 0 ? " · " : null}
      {costEur > 0 ? formatEur(costEur) : null}
    </span>
  );
}
