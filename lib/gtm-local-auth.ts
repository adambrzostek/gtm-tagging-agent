import type { GtmAuthProvider } from "google-tag-manager-mcp-core";
import { getGtmToken } from "@/lib/secret-manager";
import { exchangeGtmToken } from "@/lib/gtm-containers";

export function createOrgGtmAuth(orgId: string): GtmAuthProvider {
  return {
    async getAccessToken(): Promise<string> {
      const tokenData = await getGtmToken(orgId);
      if (!tokenData) throw new Error("GTM not connected for this organization");
      return await exchangeGtmToken(tokenData.refresh_token);
    },
  };
}
