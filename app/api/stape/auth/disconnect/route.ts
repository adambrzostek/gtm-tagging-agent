import { deleteStapeToken } from "@/lib/secret-manager";
import { auth } from "@clerk/nextjs/server";

export async function DELETE() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });
  try {
    await deleteStapeToken(orgId);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[stape/auth/disconnect] error:", err);
    return Response.json({ error: "Failed to disconnect Stape account." }, { status: 500 });
  }
}
