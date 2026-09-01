import Anthropic from "@anthropic-ai/sdk";
import { resolveAiAccess } from "@/lib/ai-access";
import { usesUserAnthropicKey } from "@/lib/api-budget";
import { resolveAiPingStatus } from "@/lib/ai-ping-status";
import {
  classifyAnthropicError,
  type AnthropicFailKind,
} from "@/lib/anthropic";
import { CLAUDE_HAIKU } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pingKey(
  apiKey: string,
): Promise<{ ok: boolean; errorKind?: AnthropicFailKind }> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, errorKind: classifyAnthropicError(e) };
  }
}

/** Ping minimal — teste la clé perso ET celle de l'app. */
export async function POST(req: Request) {
  const access = await resolveAiAccess(req);
  const userKeyActive = usesUserAnthropicKey(req);
  const sharedKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  const app = sharedKey
    ? await pingKey(sharedKey)
    : { ok: false, errorKind: "credits" as const };

  const user =
    userKeyActive && access.apiKey ? await pingKey(access.apiKey) : null;

  const status = resolveAiPingStatus({
    userKeyActive,
    sharedKey,
    blocked: access.blocked,
    quota: access.quota,
    app,
    user,
  });

  return Response.json(status);
}
