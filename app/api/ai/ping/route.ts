import Anthropic from "@anthropic-ai/sdk";
import { resolveAiAccess } from "@/lib/ai-access";
import { classifyAnthropicError } from "@/lib/anthropic";
import { CLAUDE_HAIKU } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ping minimal pour savoir si l'IA est de nouveau dispo (ex. crédits rechargés). */
export async function POST(req: Request) {
  const access = await resolveAiAccess(req);
  if (!access.apiKey || access.blocked) {
    return Response.json({
      ok: false,
      errorKind: access.blocked === "quota" ? "quota" : "credits",
    });
  }

  try {
    const client = new Anthropic({ apiKey: access.apiKey });
    await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({
      ok: false,
      errorKind: classifyAnthropicError(e),
    });
  }
}
