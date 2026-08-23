/** E-mails autorisés à voir /admin. Pas de joker. */

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | undefined | null,
  raw = process.env.ELAN_ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}
