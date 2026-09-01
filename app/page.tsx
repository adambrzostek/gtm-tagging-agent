"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Header } from "@/components/Header";

export default function HomePage() {
  const { user } = useUser();
  const firstName = user?.firstName?.trim() || "";
  const greeting = firstName
    ? `Witaj ${firstName}, jestem Rychu Peja, Twój asystent do tagowania, co chcesz zrobić?`
    : "Witaj, jestem Rychu Peja, Twój asystent do tagowania, co chcesz zrobić?";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="w-full max-w-3xl">
          <div className="mb-12">
            <p className="text-sm font-medium mb-4 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              GTM Manager
            </p>
            <h1 className="text-4xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {greeting}
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-5">
            <ChatTile />
          </div>
        </div>
      </main>
    </div>
  );
}

function ChatTile() {
  return (
    <div
      className="flex flex-col gap-5 p-6 transition-all duration-200"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div
        className="w-10 h-10 flex items-center justify-center"
        style={{ background: "var(--accent-subtle)", borderRadius: "4px", color: "var(--accent)" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <div className="flex-1">
        <h2 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Rychu Peja
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Zarządzaj Google Tag Manager przez czat. Nadawaj dostępy, twórz tagi i sprawdzaj konfiguracje bez dotykania interfejsu.
        </p>
      </div>

      <Link
        href="/chat"
        className="inline-flex items-center gap-2 self-start text-sm font-bold px-6 py-3 transition-all duration-200"
        style={{ background: "var(--accent)", color: "#000000", borderRadius: "4px" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
      >
        Otwórz
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </div>
  );
}
