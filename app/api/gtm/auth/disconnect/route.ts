import { deleteGtmToken } from "@/lib/secret-manager";
import { auth } from "@clerk/nextjs/server";

export async function DELETE() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });
  try {
    await deleteGtmToken(orgId);
    return Response.json({ success: true });
  } catch (err) {
    console.error("GTM disconnect error:", err);
    return Response.json({ error: "Nie udało się rozłączyć konta GTM." }, { status: 500 });
  }
}
