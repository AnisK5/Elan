import { isAdminEmail } from "./admin";
import { isUnlimitedSharedTokenLimit } from "./app-config";
import {
  ANTHROPIC_KEY_HEADER,
  looksLikeAnthropicKey,
  resolveAnthropicKey,
} from "./anthropic";
import { totalTokens } from "./api-usage";
import { getSupabaseAdmin } from "./supabase-admin";
import { resolveUserDailyTokenLimit } from "./user-limits";

export { envSharedDailyTokenLimit } from "./app-config";

export function usesUserAnthropicKey(req?: Request): boolean {
  const fromUser = req?.headers.get(ANTHROPIC_KEY_HEADER)?.trim() ?? "";
  return looksLikeAnthropicKey(fromUser);
}

export async function sumUserTokensToday(
  userId: string,
  day = new Date().toISOString().slice(0, 10),
): Promise<{ input: number; output: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { input: 0, output: 0 };
  try {
    const { data, error } = await admin
      .from("elan_api_usage")
      .select("input_tokens, output_tokens")
      .eq("user_id", userId)
      .eq("day", day);
    if (error) return { input: 0, output: 0 };
    let input = 0;
    let output = 0;
    for (const row of data ?? []) {
      input += row.input_tokens ?? 0;
      output += row.output_tokens ?? 0;
    }
    return { input, output };
  } catch {
    return { input: 0, output: 0 };
  }
}

export async function getUserTokensTodayTotal(
  userId: string,
  day = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const { input, output } = await sumUserTokensToday(userId, day);
  return totalTokens(input, output);
}

export async function sumGlobalTokensToday(
  day = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  try {
    const { data, error } = await admin
      .from("elan_api_usage")
      .select("input_tokens, output_tokens")
      .eq("day", day);
    if (error) return 0;
    let input = 0;
    let output = 0;
    for (const row of data ?? []) {
      input += row.input_tokens ?? 0;
      output += row.output_tokens ?? 0;
    }
    return totalTokens(input, output);
  } catch {
    return 0;
  }
}

export interface SharedBudgetStatus {
  applies: boolean;
  allowed: boolean;
  used: number;
  limit: number;
}

export function isSharedTokenQuotaExempt(
  email: string | null | undefined,
): boolean {
  return isAdminEmail(email);
}

export async function checkSharedDailyBudget(
  req: Request,
  userId: string | null,
  userEmail?: string | null,
): Promise<SharedBudgetStatus> {
  const limit = await resolveUserDailyTokenLimit(userId);
  if (isUnlimitedSharedTokenLimit(limit)) {
    return { applies: false, allowed: true, used: 0, limit };
  }
  if (usesUserAnthropicKey(req)) {
    return { applies: false, allowed: true, used: 0, limit };
  }
  if (isSharedTokenQuotaExempt(userEmail)) {
    return { applies: false, allowed: true, used: 0, limit };
  }
  if (!resolveAnthropicKey(req)) {
    return { applies: false, allowed: false, used: 0, limit };
  }
  if (!userId) {
    return { applies: false, allowed: true, used: 0, limit };
  }
  const { input, output } = await sumUserTokensToday(userId);
  const used = totalTokens(input, output);
  return { applies: true, allowed: used < limit, used, limit };
}
