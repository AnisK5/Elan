import { isAdminEmail } from "@/lib/admin";
import {
  buildAdminAnalytics,
  type RawAnalyticsSession,
  type RawApiUsageRow,
} from "@/lib/admin-analytics";
import { getUserFromBearer } from "@/lib/auth-request";
import type { ChatMessage } from "@/lib/types";
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

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const [authUsers, usageRes, sessionsRes, settingsRes] = await Promise.all([
      listAuthUsers(admin),
      admin
        .from("elan_api_usage")
        .select(
          "user_id, at, day, route, model, input_tokens, output_tokens, session_id, session_context, exchange_index, exchange_kind",
        )
        .gte("at", since90)
        .order("at", { ascending: false }),
      admin
        .from("elan_sessions")
        .select("user_id, id, date, duration_min, context, transcript")
        .gte("date", since90)
        .order("date", { ascending: false }),
      admin.from("elan_settings").select("user_id, name"),
    ]);

    const userEmails = new Map(
      authUsers.map((u) => [u.id, u.email ?? ""]),
    );
    const userNames = new Map<string, string>();
    for (const row of (settingsRes.data ?? []) as {
      user_id: string;
      name: string | null;
    }[]) {
      if (row.name) userNames.set(row.user_id, row.name);
    }

    const usage: RawApiUsageRow[] = (
      (usageRes.error ? [] : usageRes.data) ?? []
    ).map((r: {
      user_id: string | null;
      at: string;
      day: string;
      route: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      session_id: string | null;
      session_context: string | null;
      exchange_index: number | null;
      exchange_kind: string | null;
    }) => ({
      userId: r.user_id,
      at: r.at,
      day: r.day,
      route: r.route,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      sessionId: r.session_id,
      sessionContext: r.session_context,
      exchangeIndex: r.exchange_index,
      exchangeKind: r.exchange_kind,
    }));

    const sessions: RawAnalyticsSession[] = (
      (sessionsRes.data ?? []) as {
        user_id: string;
        id: string;
        date: string;
        duration_min: number;
        context: string | null;
        transcript: ChatMessage[];
      }[]
    ).map((r) => ({
      userId: r.user_id,
      id: r.id,
      date: r.date,
      durationMin: r.duration_min,
      context: r.context,
      transcript: r.transcript ?? [],
    }));

    return Response.json(
      buildAdminAnalytics(
        usage,
        sessions,
        userEmails,
        userNames,
        userId,
      ),
    );
  } catch {
    return Response.json({ error: "analytics-failed" }, { status: 500 });
  }
}
