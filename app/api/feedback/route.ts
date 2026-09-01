import { getUserFromBearer } from "@/lib/auth-request";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 2000;
const RATINGS = new Set(["up", "down"]);
const MOODS = new Set(["bien", "bof", "bloque", "up", "down"]);
const SOURCES = new Set([
  "settings",
  "wrap_up",
  "home",
  "survey_wtp",
]);

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
  }

  let body: {
    message?: string;
    mood?: string;
    rating?: string;
    source?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const rating =
    body.rating && RATINGS.has(body.rating) ? body.rating : null;
  const mood =
    rating ??
    (body.mood && MOODS.has(body.mood) ? body.mood : null);

  if (!message && !mood) {
    return Response.json({ error: "empty-feedback" }, { status: 400 });
  }
  if (message.length > MAX_LEN) {
    return Response.json({ error: "too-long" }, { status: 400 });
  }

  const source =
    body.source && SOURCES.has(body.source) ? body.source : "home";

  const { data, error } = await admin
    .from("elan_feedback")
    .insert({
      user_id: user.id,
      message: message || (mood === "up" ? "👍" : mood === "down" ? "👎" : mood ?? ""),
      mood,
      source,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return Response.json({ error: "insert-failed" }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id, createdAt: data.created_at });
}
