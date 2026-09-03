import { getGtmWhitelist, saveGtmWhitelist } from "@/lib/secret-manager";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });
  const whitelist = await getGtmWhitelist(orgId);
  return Response.json({ whitelist });
}

export async function POST(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });
  const body = await req.json() as unknown;
  if (!Array.isArray(body) || !body.every((x) => typeof x === "string")) {
    return Response.json(
      { error: "Body musi być tablicą stringów (publicId kontenerów)." },
      { status: 400 }
    );
  }

  await saveGtmWhitelist(orgId, body as string[]);
  return Response.json({ ok: true, count: body.length });
}
