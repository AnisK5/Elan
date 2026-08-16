/** Mail matin — conseil complet (pas la version notif courte). */

export function isRitualEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RITUAL_EMAIL_FROM);
}

export function ritualAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://elan-roan.vercel.app")
  );
}

export function buildRitualEmail(opts: {
  name?: string;
  minutes: number;
  planMessage: string;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Bonjour ${opts.name},` : "Bonjour,";
  const plan = opts.planMessage.trim() || "Rien qui presse — un petit point quand tu veux ?";
  const subject = `Élan · ${opts.minutes} min aujourd'hui`;
  const url = ritualAppUrl();

  const text = `${greeting}

${plan}

Je te propose un créneau de ${opts.minutes} min — ouvre Élan quand tu veux, on s'y met ensemble :
${url}

— Élan`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:Georgia,'Times New Roman',serif;line-height:1.55;color:#1a1a1a;max-width:32em;margin:0 auto;padding:24px">
  <p style="margin:0 0 1em">${greeting}</p>
  <p style="margin:0 0 1.25em;font-size:17px">${escapeHtml(plan)}</p>
  <p style="margin:0 0 1.5em;color:#444">Je te propose un créneau de <strong>${opts.minutes} min</strong> — ouvre Élan quand tu veux, on s'y met ensemble.</p>
  <p style="margin:0 0 2em"><a href="${escapeHtml(url)}" style="color:#0d6b5c">Ouvrir Élan</a></p>
  <p style="margin:0;font-size:13px;color:#888">— Élan</p>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendRitualEmail(opts: {
  to: string;
  name?: string;
  minutes: number;
  planMessage: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RITUAL_EMAIL_FROM;
  if (!key || !from) return false;

  const { subject, html, text } = buildRitualEmail(opts);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ritual-email]", res.status, detail.slice(0, 300));
    return false;
  }
  return true;
}
