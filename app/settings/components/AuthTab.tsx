"use client";

import { GTMTab } from "./GTMTab";

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
    </div>
  );
}
