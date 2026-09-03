import { auth } from "@clerk/nextjs/server";
import { getOrgEvents, addOrgEvent } from "@/lib/org-events";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });

  try {
    const events = await getOrgEvents(orgId);
    return Response.json({ events });
  } catch (err) {
    console.error("[org-events] GET error:", err);
    return Response.json({ error: "Nie udało się załadować zdarzeń." }, { status: 500 });
  }
}

interface EventBody {
  event_group?: unknown;
  event_name?: unknown;
  description?: unknown;
  parameters?: unknown;
  meta_event?: unknown;
  tiktok_event?: unknown;
}

export async function POST(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });

  let body: EventBody;
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const event_name = typeof body.event_name === "string" ? body.event_name.trim() : "";
  if (!event_name) {
    return Response.json({ error: "event_name jest wymagany." }, { status: 400 });
  }

  const event_group = typeof body.event_group === "string" ? body.event_group.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const parameters = Array.isArray(body.parameters)
    ? (body.parameters as unknown[]).filter((p) => typeof p === "string").map((p) => (p as string).trim()).filter(Boolean)
    : [];
  const meta_event = typeof body.meta_event === "string" && body.meta_event.trim() ? body.meta_event.trim() : null;
  const tiktok_event = typeof body.tiktok_event === "string" && body.tiktok_event.trim() ? body.tiktok_event.trim() : null;

  try {
    const existing = await getOrgEvents(orgId);
    const duplicate = existing.some(
      (e) => e.event_name.toLowerCase() === event_name.toLowerCase()
    );
    if (duplicate) {
      return Response.json({ error: `Zdarzenie "${event_name}" już istnieje.` }, { status: 409 });
    }

    await addOrgEvent(orgId, { event_group, event_name, description, parameters, meta_event, tiktok_event });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[org-events] POST error:", err);
    return Response.json({ error: "Nie udało się dodać zdarzenia." }, { status: 500 });
  }
}
