import { parseAdminEmails } from "./admin";
import { formatFeedbackMood, formatFeedbackSource } from "./feedback-labels";
import { ritualAppUrl } from "./ritual-email";

/** True si ce retour mérite un email admin (pas un simple 👍 sans texte). */
export function shouldNotifyAdminFeedback(opts: {
  message: string;
  mood: string | null;
}): boolean {
  const text = opts.message.trim();
  if (opts.mood === "down" || opts.mood === "bloque" || opts.mood === "bof") {
    return true;
  }
  if (!text) return false;
  if (text === "👍" || text === "👎") return opts.mood === "down";
  return text.length >= 2;
}

export async function notifyAdminNewFeedback(opts: {
  message: string;
  mood: string | null;
  source: string;
  userId: string;
  userEmail?: string | null;
}): Promise<void> {
  if (!shouldNotifyAdminFeedback(opts)) return;

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RITUAL_EMAIL_FROM;
  const recipients = parseAdminEmails(process.env.ELAN_ADMIN_EMAILS);
  if (!key || !from || recipients.length === 0) return;

  const moodLabel = formatFeedbackMood(opts.mood);
  const sourceLabel = formatFeedbackSource(opts.source);
  const who = opts.userEmail?.trim() || opts.userId;

  const lines = [
    "Nouveau message depuis Élan.",
    "",
    opts.message ? `Message : ${opts.message}` : null,
    moodLabel ? `Signal : ${moodLabel}` : null,
    `De : ${who}`,
    `Via : ${sourceLabel}`,
    "",
    `Tous les retours : ${ritualAppUrl()}/admin/feedbacks`,
  ].filter((l): l is string => Boolean(l));

  const subject = opts.message
    ? `Élan · ${opts.message.slice(0, 48)}${opts.message.length > 48 ? "…" : ""}`
    : "Élan · retour utilisateur";

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
        reply_to: opts.userEmail?.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[feedback-notify]", res.status, detail.slice(0, 300));
    }
  } catch (e) {
    console.error("[feedback-notify]", e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
