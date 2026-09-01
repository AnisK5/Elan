import Anthropic from "@anthropic-ai/sdk";
import { resolveAiAccess } from "./ai-access";
import {
  getUserTokensTodayTotal,
  isSharedTokenQuotaExempt,
  sumGlobalTokensToday,
  usesUserAnthropicKey,
} from "./api-budget";
import {
  formatSharedTokenLimit,
  isUnlimitedSharedTokenLimit,
  resolveSharedDailyTokenLimit,
} from "./app-config";
import { classifyAnthropicError, maskApiKeySuffix, type AnthropicFailKind } from "./anthropic";
import { getUserFromBearer } from "./auth-request";
import { CLAUDE_HAIKU } from "./models";
import { formatQuotaUsage } from "./token-display";

export interface AiHealthSnapshot {
  anthropicKeyConfigured: boolean;
  appPingOk: boolean;
  appPingError?: AnthropicFailKind;
  pingErrorDetail?: string;
  userEmail?: string | null;
  quotaExempt: boolean;
  quotaBlocked: boolean;
  quotaUsed: number;
  quotaUsedGlobal: number;
  quotaLimit: number;
  sharedKeySuffix?: string;
  diagnosis: string;
}

interface PingResult {
  ok: boolean;
  errorKind?: AnthropicFailKind;
  errorDetail?: string;
}

async function pingSharedKey(apiKey: string): Promise<PingResult> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return { ok: true };
  } catch (e) {
    const errorDetail =
      e instanceof Error
        ? e.message.slice(0, 240)
        : typeof e === "string"
          ? e.slice(0, 240)
          : undefined;
    return {
      ok: false,
      errorKind: classifyAnthropicError(e),
      errorDetail,
    };
  }
}

export async function buildAiHealth(req: Request): Promise<AiHealthSnapshot> {
  const user = await getUserFromBearer(req);
  const sharedKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const access = await resolveAiAccess(req);
  const limit = await resolveSharedDailyTokenLimit();
  const exempt = isSharedTokenQuotaExempt(user?.email);
  const userKeyActive = usesUserAnthropicKey(req);
  const quotaUsed = user?.id ? await getUserTokensTodayTotal(user.id) : 0;
  const quotaUsedGlobal = exempt ? await sumGlobalTokensToday() : 0;

  const app = sharedKey ? await pingSharedKey(sharedKey) : { ok: false };
  const sharedKeySuffix = maskApiKeySuffix(sharedKey);

  let diagnosis = "";
  if (!sharedKey) {
    diagnosis =
      "ANTHROPIC_API_KEY absente sur Vercel — ajoute-la en Production puis redéploie.";
  } else if (!app.ok && app.errorKind === "credits") {
    const keyHint = sharedKeySuffix ? ` (clé Vercel ${sharedKeySuffix})` : "";
    const usageHint =
      quotaUsedGlobal > 0
        ? ` Aujourd'hui l'app a consommé ${formatQuotaUsage(quotaUsedGlobal)}.`
        : "";
    diagnosis =
      `Compte Anthropic sans crédits${keyHint} — les crédits sont sur le compte, pas sur une clé : en changer ne suffit pas.${usageHint} Recharge sur Plans & Billing (console Anthropic), attends 1–2 min, puis Réessayer.`;
  } else if (!app.ok && app.errorKind === "auth") {
    diagnosis =
      "La clé sur Vercel est refusée par Anthropic — régénère-la et mets à jour ANTHROPIC_API_KEY sur Vercel.";
  } else if (access.quota?.over) {
    diagnosis = `Plafond journalaire dépassé (${access.quota.used}/${formatSharedTokenLimit(access.quota.limit)}) — alerte seulement, l'IA n'est plus bloquée. Choisis « Illimité » ci-dessous si besoin.`;
  } else if (userKeyActive) {
    diagnosis =
      "Une clé perso est envoyée dans les requêtes — vérifie Réglages → Clé Claude.";
  } else if (app.ok) {
    diagnosis = "La clé de l'app répond OK.";
    if (exempt) {
      diagnosis += " Ton compte admin est exempt du plafond journalier.";
    }
    if (
      !isUnlimitedSharedTokenLimit(limit) &&
      !exempt &&
      access.quota
    ) {
      diagnosis += ` Plafond actuel : ${formatSharedTokenLimit(limit)}.`;
    }
  } else {
    diagnosis = `Erreur API : ${app.errorKind ?? "inconnue"}.`;
    if (app.errorDetail) {
      diagnosis += ` Détail : « ${app.errorDetail} ».`;
    }
  }

  return {
    anthropicKeyConfigured: Boolean(sharedKey),
    appPingOk: app.ok,
    appPingError: app.ok ? undefined : app.errorKind,
    pingErrorDetail: app.errorDetail,
    userEmail: user?.email ?? null,
    quotaExempt: exempt,
    quotaBlocked: Boolean(access.quota?.over),
    quotaUsed,
    quotaUsedGlobal,
    quotaLimit: limit,
    sharedKeySuffix,
    diagnosis,
  };
}
