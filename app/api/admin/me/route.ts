import { isAdminEmail } from "@/lib/admin";
import { getUserFromBearer } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ admin: isAdminEmail(user.email) });
}
