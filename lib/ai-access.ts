import { resolveAnthropicKey } from "./anthropic";
import { checkSharedDailyBudget, usesUserAnthropicKey } from "./api-budget";
import { resolveUserIdFromRequest } from "./api-usage";

export type AiBlockKind = "no_key" | "quota";

export interface AiAccess {
  apiKey: string | null;
  userId: string | null;
  usesSharedKey: boolean;
  blocked?: AiBlockKind;
  quota?: { used: number; limit: number };
}

export async function resolveAiAccess(req: Request): Promise<AiAccess> {
  const apiKey = resolveAnthropicKey(req);
  const userId = await resolveUserIdFromRequest(req);
  const usesSharedKey = Boolean(apiKey && !usesUserAnthropicKey(req));

  if (!apiKey) {
    return { apiKey: null, userId, usesSharedKey: false, blocked: "no_key" };
  }

  if (usesSharedKey) {
    const budget = await checkSharedDailyBudget(req, userId);
    if (budget.applies && !budget.allowed) {
      return {
        apiKey,
        userId,
        usesSharedKey: true,
        blocked: "quota",
        quota: { used: budget.used, limit: budget.limit },
      };
    }
  }

  return { apiKey, userId, usesSharedKey };
}
