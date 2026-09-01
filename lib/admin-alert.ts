import { parseAdminEmails } from "./admin";
import { ritualAppUrl } from "./ritual-email";
import { getSupabaseAdmin } from "./supabase-admin";

const COOLDOWN_MS = 60 * 60 * 1000;

export type AdminAiAlertKind = "credits" | "quota";

export async function notifyAdminAiIssue(opts: {
  kind: AdminAiAlertKind;
  route: string;
  userId?: string | null;
  detail?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RITUAL_EMAIL_FROM;
  const recipients = parseAdminEmails(process.env.ELAN_ADMIN_EMAILS);
  if (!key || !from || recipients.length === 0) return;

  const alertKind = `ai_${opts.kind}`;
  if (!(await shouldSendAlert(alertKind))) return;

  const subject =
    opts.kind === "credits"
      ? "Élan · crédits Anthropic épuisés"
      : "Élan · quota journalier IA atteint";

  const lines = [
    opts.kind === "credits"
      ? "La clé partagée Anthropic est à sec — les utilisateurs sans clé perso sont en mode dégradé."
      : "Un utilisateur a atteint le plafond journalier sur la clé partagée.",
    "",
    `Route : ${opts.route}`,
    opts.userId ? `Utilisateur : ${opts.userId}` : null,
    opts.detail ? `Détail : ${opts.detail}` : null,
    "",
    `Admin : ${ritualAppUrl()}/admin/analytics`,
  ].filter((l): l is string => Boolean(l));

  const text = lines.join("\n");
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:36em;padding:20px">
${lines.map((l) => `<p style="margin:0 0 0.75em">${escapeHtml(l)}</p>`).join("")}
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[admin-alert]", res.status, detail.slice(0, 300));
    }
  } catch (e) {
    console.error("[admin-alert]", e);
  }
}

async function shouldSendAlert(kind: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return true;
  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  try {
    const { data, error } = await admin
      .from("elan_admin_alerts")
      .select("kind")
      .eq("kind", kind)
      .gte("sent_at", since)
      .limit(1);
    if (error) return true;
    if (data && data.length > 0) return false;
    await admin.from("elan_admin_alerts").upsert({
      kind,
      sent_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return true;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
