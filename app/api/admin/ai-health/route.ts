import { isAdminEmail } from "@/lib/admin";
import { buildAiHealth } from "@/lib/ai-health";
import { getUserFromBearer } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const health = await buildAiHealth(req);
  return Response.json(health);
}
