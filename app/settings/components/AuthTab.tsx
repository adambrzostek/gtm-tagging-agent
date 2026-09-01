"use client";

import { GTMTab } from "./GTMTab";
import { StapeTab } from "./StapeTab";

const R = "4px";

export function AuthTab() {
  return (
    <div className="flex flex-col gap-8 max-w-lg">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Google Tag Manager
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
            Wymagane do listowania kontenerów i walidacji whitelisty.
          </p>
        </div>
        <GTMTab />
      </section>

      <div style={{ height: "1px", background: "var(--border)" }} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Stape MCP Connection
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
            Wymagane, aby asystent AI mógł tworzyć i edytować tagi GTM przez Stape MCP Server.
          </p>
        </div>
        <StapeTab />
      </section>
    </div>
  );
}
