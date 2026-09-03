import { getGtmToken, getGtmAccountWhitelist } from "@/lib/secret-manager";
import { exchangeGtmToken, fetchGtmAccountList } from "@/lib/gtm-containers";
import { auth } from "@clerk/nextjs/server";

export interface GtmAccount {
  accountId: string;
  name: string;
  isWhitelisted: boolean;
}

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });

  const token = await getGtmToken(orgId);
  if (!token) {
    return Response.json(
      { error: "GTM not connected. Connect your account in Settings → Authorization." },
      { status: 404 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await exchangeGtmToken(token.refresh_token);
  } catch (err) {
    console.error("[gtm/accounts-list] token refresh failed:", err);
    return Response.json({ error: "Token refresh failed." }, { status: 500 });
  }

  const [accounts, whitelist] = await Promise.all([
    fetchGtmAccountList(accessToken),
    getGtmAccountWhitelist(orgId),
  ]);

  const wlSet = new Set(whitelist);
  const result: GtmAccount[] = accounts.map((a) => ({
    accountId: a.accountId,
    name: a.name,
    isWhitelisted: wlSet.has(a.accountId),
  }));

  return Response.json({ accounts: result });
}
