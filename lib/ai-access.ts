import { notifyAdminAiIssue } from "./admin-alert";
import { resolveAnthropicKey } from "./anthropic";
import { checkSharedDailyBudget, usesUserAnthropicKey } from "./api-budget";
import { getUserFromBearer } from "./auth-request";
import { formatSharedTokenLimit } from "./app-config";
import { formatTokensWithEur } from "./token-display";

export type AiBlockKind = "no_key";

export interface AiAccess {
  apiKey: string | null;
  userId: string | null;
  usesSharedKey: boolean;
  /** Présent quand le plafond journalier est dépassé — suivi seulement, sans bloquer. */
  blocked?: AiBlockKind;
  quota?: { used: number; limit: number; over: boolean };
}

export async function resolveAiAccess(req: Request): Promise<AiAccess> {
  const apiKey = resolveAnthropicKey(req);
  const user = await getUserFromBearer(req);
  const userId = user?.id ?? null;
  const usesSharedKey = Boolean(apiKey && !usesUserAnthropicKey(req));

  if (!apiKey) {
    return { apiKey: null, userId, usesSharedKey: false, blocked: "no_key" };
  }

  let quota: AiAccess["quota"];
  if (usesSharedKey && userId) {
    const budget = await checkSharedDailyBudget(req, userId, user?.email);
    if (budget.applies) {
      const over = !budget.allowed;
      quota = { used: budget.used, limit: budget.limit, over };
      if (over) {
        void notifyAdminAiIssue({
          kind: "quota",
          route: "budget-soft",
          userId,
          detail: `${formatTokensWithEur(budget.used)}/${formatSharedTokenLimit(budget.limit)} (alerte, pas de blocage)`,
        });
      }
    }
  }

  return { apiKey, userId, usesSharedKey, quota };
}
