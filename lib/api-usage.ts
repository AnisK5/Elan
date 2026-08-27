import type Anthropic from "@anthropic-ai/sdk";
import { getUserFromBearer } from "./auth-request";
import { getSupabaseAdmin } from "./supabase-admin";

export type ApiRoute = "session" | "chat" | "plan" | "reconcile" | "tidy";

export interface ApiUsageRecord {
  userId?: string | null;
  route: ApiRoute;
  model: string;
  inputTokens: number;
  outputTokens: number;
  sessionId?: string | null;
  sessionContext?: string | null;
  exchangeIndex?: number | null;
  exchangeKind?: string | null;
  stopReason?: string | null;
  latencyMs?: number | null;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function resolveUserIdFromRequest(
  req: Request,
): Promise<string | null> {
  const user = await getUserFromBearer(req);
  return user?.id ?? null;
}

export async function recordApiUsage(record: ApiUsageRecord): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("elan_api_usage").insert({
      user_id: record.userId ?? null,
      day: utcDay(),
      route: record.route,
      model: record.model,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      session_id: record.sessionId ?? null,
      session_context: record.sessionContext ?? null,
      exchange_index: record.exchangeIndex ?? null,
      exchange_kind: record.exchangeKind ?? null,
      stop_reason: record.stopReason ?? null,
      latency_ms: record.latencyMs ?? null,
    });
  } catch {
    // table peut manquer tant que le SQL n'est pas passé
  }
}

export async function recordMessageUsage(
  req: Request,
  res: Anthropic.Messages.Message,
  record: Omit<
    ApiUsageRecord,
    "userId" | "model" | "inputTokens" | "outputTokens" | "stopReason"
  >,
  startedAt: number,
): Promise<void> {
  const userId = await resolveUserIdFromRequest(req);
  await recordApiUsage({
    ...record,
    userId,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    stopReason: res.stop_reason ?? null,
    latencyMs: Date.now() - startedAt,
  });
}

type MessageStream = ReturnType<
  Anthropic["messages"]["stream"]
>;

export async function recordStreamUsage(
  req: Request,
  stream: MessageStream,
  record: Omit<
    ApiUsageRecord,
    "userId" | "model" | "inputTokens" | "outputTokens" | "stopReason"
  >,
  startedAt: number,
): Promise<void> {
  try {
    const final = await stream.finalMessage();
    const userId = await resolveUserIdFromRequest(req);
    await recordApiUsage({
      ...record,
      userId,
      model: final.model,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      stopReason: final.stop_reason ?? null,
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    // flux interrompu ou table absente
  }
}

export function sessionExchangeKind(
  ending: boolean | undefined,
  messageCount: number,
): string {
  if (ending) return "closing";
  if (messageCount === 0) return "opening";
  return "user_turn";
}

export function totalTokens(input: number, output: number): number {
  return input + output;
}
