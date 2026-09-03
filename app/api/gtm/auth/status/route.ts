import { getGtmStatus } from "@/lib/secret-manager";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });
  const status = await getGtmStatus(orgId);
  return Response.json(status);
}
