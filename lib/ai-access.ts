import { resolveAnthropicKey } from "./anthropic";
import { checkSharedDailyBudget, usesUserAnthropicKey } from "./api-budget";
import { getUserFromBearer } from "./auth-request";

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
  const user = await getUserFromBearer(req);
  const userId = user?.id ?? null;
  const usesSharedKey = Boolean(apiKey && !usesUserAnthropicKey(req));

  if (!apiKey) {
    return { apiKey: null, userId, usesSharedKey: false, blocked: "no_key" };
  }

  if (usesSharedKey) {
    const budget = await checkSharedDailyBudget(req, userId, user?.email);
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
