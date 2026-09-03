import { auth } from "@clerk/nextjs/server";
import { deleteOrgEvent } from "@/lib/org-events";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });

  const { id } = await params;
  if (!id) return Response.json({ error: "Brak id zdarzenia." }, { status: 400 });

  try {
    await deleteOrgEvent(orgId, id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nie udało się usunąć zdarzenia.";
    const status = message === "Cannot delete default events" ? 403 : message === "Event not found" ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
