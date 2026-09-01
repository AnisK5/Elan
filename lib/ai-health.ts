import Anthropic from "@anthropic-ai/sdk";
import { isAdminEmail } from "./admin";
import { resolveAiAccess } from "./ai-access";
import {
  checkSharedDailyBudget,
  isSharedTokenQuotaExempt,
  usesUserAnthropicKey,
} from "./api-budget";
import { formatSharedTokenLimit } from "./app-config";
import { classifyAnthropicError, type AnthropicFailKind } from "./anthropic";
import { getUserFromBearer } from "./auth-request";
import { CLAUDE_HAIKU } from "./models";

export interface AiHealthSnapshot {
  anthropicKeyConfigured: boolean;
  appPingOk: boolean;
  appPingError?: AnthropicFailKind;
  userEmail?: string | null;
  quotaExempt: boolean;
  quotaBlocked: boolean;
  quotaUsed: number;
  quotaLimit: number;
  diagnosis: string;
}

async function pingSharedKey(
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

export async function buildAiHealth(req: Request): Promise<AiHealthSnapshot> {
  const user = await getUserFromBearer(req);
  const sharedKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const access = await resolveAiAccess(req);
  const limit = await resolveSharedDailyTokenLimit();
  const budget = await checkSharedDailyBudget(
    req,
    user?.id ?? null,
    user?.email,
  );
  const exempt = isSharedTokenQuotaExempt(user?.email);
  const userKeyActive = usesUserAnthropicKey(req);

  const app = sharedKey ? await pingSharedKey(sharedKey) : { ok: false };

  let diagnosis = "";
  if (!sharedKey) {
    diagnosis =
      "ANTHROPIC_API_KEY absente sur Vercel — ajoute-la en Production puis redéploie.";
  } else if (!app.ok && app.errorKind === "credits") {
    diagnosis =
      "La clé sur Vercel répond « crédits épuisés » — recharge le compte lié à CETTE clé (console Anthropic → API keys).";
  } else if (access.blocked === "quota") {
    diagnosis = exempt
      ? "Plafond tokens atteint mais ton e-mail devrait être exempt — vérifie ELAN_ADMIN_EMAILS sur Vercel."
      : `Plafond journalier atteint (${budget.used}/${formatSharedTokenLimit(limit)}). Choisis « Illimité » dans /admin ou attends demain.`;
  } else if (userKeyActive) {
    diagnosis =
      "Une clé perso est envoyée dans les requêtes — vérifie Réglages → Clé Claude.";
  } else if (app.ok) {
    diagnosis = "La clé de l'app répond OK — le bandeau ne devrait pas rester.";
  } else {
    diagnosis = `Erreur API : ${app.errorKind ?? "inconnue"}.`;
  }

  return {
    anthropicKeyConfigured: Boolean(sharedKey),
    appPingOk: app.ok,
    appPingError: app.ok ? undefined : app.errorKind,
    userEmail: user?.email ?? null,
    quotaExempt: exempt,
    quotaBlocked: access.blocked === "quota",
    quotaUsed: budget.used,
    quotaLimit: limit,
    diagnosis,
  };
}
