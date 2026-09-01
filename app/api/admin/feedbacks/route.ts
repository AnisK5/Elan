import { isAdminEmail } from "@/lib/admin";
import { buildAdminFeedbacksList } from "@/lib/admin-feedbacks";
import type { AdminRawFeedback } from "@/lib/admin-stats";
import { getUserFromBearer } from "@/lib/auth-request";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuthUserLike {
  id: string;
  email?: string;
}

async function listAuthUsers(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<AuthUserLike[]> {
  const out: AuthUserLike[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data.users ?? [];
    out.push(...batch);
    if (batch.length < 200) break;
  }
  return out;
}

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "supabase-admin-not-configured" }, { status: 503 });
  }

  try {
    const [feedbackRes, settingsRes, authUsers] = await Promise.all([
      admin
        .from("elan_feedback")
        .select("id, user_id, message, mood, source, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      admin.from("elan_settings").select("user_id, name"),
      listAuthUsers(admin),
    ]);

    if (feedbackRes.error) throw feedbackRes.error;

    const names = new Map<string, string>();
    for (const row of (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
    }[]) {
      if (row.name) names.set(row.user_id, row.name);
    }

    const userEmails = new Map(
      authUsers.map((u) => [u.id, u.email ?? ""]),
    );

    const feedbacks: AdminRawFeedback[] = (
      (feedbackRes.data ?? []) as {
        id: string;
        user_id: string;
        message: string;
        mood: string | null;
        source: string;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      userId: r.user_id,
      message: r.message,
      mood: r.mood,
      source: r.source,
      createdAt: r.created_at,
    }));

    return Response.json(
      buildAdminFeedbacksList(feedbacks, userEmails, names),
    );
  } catch {
    return Response.json({ error: "feedbacks-failed" }, { status: 500 });
  }
}
