import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/** Utilisateur Supabase à partir du Bearer JWT (routes API authentifiées). */
export async function getUserFromBearer(req: Request): Promise<User | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user;
}

export function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}
