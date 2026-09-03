"use client";

import { useState, useEffect, useCallback } from "react";

interface OrgEvent {
  id: string;
  event_group: string;
  event_name: string;
  description: string;
  parameters: string[];
  meta_event: string | null;
  tiktok_event: string | null;
  source: "default" | "custom";
  created_at: string;
}

const R = "4px";

export function EventsTab() {
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org-events");
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Nie udało się załadować zdarzeń.");
        return;
      }
      const data = await res.json() as { events: OrgEvent[] };
      setEvents(data.events.sort((a, b) => {
        if (a.event_group !== b.event_group) return a.event_group.localeCompare(b.event_group, "pl");
        return a.event_name.localeCompare(b.event_name, "pl");
      }));
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/org-events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Nie udało się usunąć zdarzenia.");
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
    }
  };

  const handleAdded = (event: OrgEvent) => {
    setEvents((prev) =>
      [...prev, event].sort((a, b) => {
        if (a.event_group !== b.event_group) return a.event_group.localeCompare(b.event_group, "pl");
        return a.event_name.localeCompare(b.event_name, "pl");
      })
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Taksonomia zdarzeń</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
            Zdarzenia domyślne są seedowane automatycznie. Własne zdarzenia można dodawać i usuwać.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-2 text-sm px-3 py-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: loading ? 0.5 : 1, borderRadius: R }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? "spin 1s linear infinite" : undefined }}>
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Odśwież
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 font-semibold"
            style={{ background: "var(--accent)", color: "#000000", borderRadius: R }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Dodaj zdarzenie
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-sm" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", color: "var(--error)", borderRadius: R }}>
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center py-16 gap-3" style={{ color: "var(--text-muted)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          <span className="text-sm">Ładowanie zdarzeń...</span>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: R, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: "900px" }}>
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  <Th>Grupa</Th>
                  <Th>Nazwa zdarzenia</Th>
                  <Th>Opis</Th>
                  <Th>Parametry</Th>
                  <Th>Meta</Th>
                  <Th>TikTok</Th>
                  <Th>Źródło</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? "var(--background)" : "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                    <Td>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{e.event_group || "—"}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs px-2 py-0.5" style={{ background: "var(--surface-elevated)", color: "var(--text-primary)", borderRadius: "3px", fontWeight: 500 }}>{e.event_name}</span>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: "var(--text-secondary)", lineHeight: "1.5" }}>{e.description || "—"}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {e.parameters.length === 0 ? (
                          <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>—</span>
                        ) : (
                          e.parameters.map((p) => (
                            <span key={p} className="px-1.5 py-0.5 text-xs" style={{ background: "rgba(114,13,214,0.06)", color: "var(--accent)", borderRadius: "3px", border: "1px solid rgba(114,13,214,0.15)", fontFamily: "var(--font-mono)" }}>{p}</span>
                          ))
                        )}
                      </div>
                    </Td>
                    <Td>
                      {e.meta_event ? (
                        <span className="px-1.5 py-0.5 text-xs font-medium" style={{ background: "rgba(24,119,242,0.08)", color: "#1877f2", borderRadius: "3px" }}>{e.meta_event}</span>
                      ) : <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>—</span>}
                    </Td>
                    <Td>
                      {e.tiktok_event ? (
                        <span className="px-1.5 py-0.5 text-xs font-medium" style={{ background: "rgba(0,0,0,0.06)", color: "var(--text-primary)", borderRadius: "3px" }}>{e.tiktok_event}</span>
                      ) : <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>—</span>}
                    </Td>
                    <Td>
                      {e.source === "default" ? (
                        <span className="px-2 py-0.5 text-xs font-medium" style={{ background: "rgba(22,163,74,0.08)", color: "#16a34a", borderRadius: "3px" }}>Domyślne</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium" style={{ background: "rgba(217,119,6,0.08)", color: "#d97706", borderRadius: "3px" }}>Własne</span>
                      )}
                    </Td>
                    <Td>
                      {e.source === "custom" && (
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-xs px-2 py-1"
                          style={{ color: "var(--error)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "3px", background: "transparent" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "rgba(220,38,38,0.06)"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "transparent"; }}
                        >
                          Usuń
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <EmptyState
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>}
          title="Brak zdarzeń"
          description="Odśwież listę — zdarzenia domyślne zostaną zainicjowane automatycznie."
        />
      )}

      {showModal && (
        <AddEventModal
          onClose={() => setShowModal(false)}
          onAdded={(event) => { handleAdded(event); setShowModal(false); }}
        />
      )}
    </div>
  );
}

// ── Add Event Modal ─────────────────────────────────────────────────────────

interface AddEventModalProps {
  onClose: () => void;
  onAdded: (event: OrgEvent) => void;
}

function AddEventModal({ onClose, onAdded }: AddEventModalProps) {
  const [form, setForm] = useState({
    event_name: "",
    event_group: "",
    description: "",
    parameters: "",
    meta_event: "",
    tiktok_event: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        event_name: form.event_name.trim(),
        event_group: form.event_group.trim(),
        description: form.description.trim(),
        parameters: form.parameters.split(",").map((p) => p.trim()).filter(Boolean),
        meta_event: form.meta_event.trim() || null,
        tiktok_event: form.tiktok_event.trim() || null,
      };
      const res = await fetch("/api/org-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Nie udało się dodać zdarzenia.");
        return;
      }
      // Fetch the new events list to get the generated id
      const listRes = await fetch("/api/org-events");
      const listData = await listRes.json() as { events: OrgEvent[] };
      const added = listData.events.find((ev) => ev.event_name === body.event_name && ev.source === "custom");
      if (added) onAdded(added);
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 flex flex-col gap-0" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Dodaj zdarzenie</h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          <Field label="Nazwa zdarzenia *">
            <input
              required
              value={form.event_name}
              onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))}
              placeholder="np. custom_click"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          <Field label="Grupa">
            <input
              value={form.event_group}
              onChange={(e) => setForm((f) => ({ ...f, event_group: e.target.value }))}
              placeholder="np. Zaangażowanie"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          <Field label="Opis">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Krótki opis zdarzenia"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          <Field label="Parametry (rozdzielone przecinkami)">
            <input
              value={form.parameters}
              onChange={(e) => setForm((f) => ({ ...f, parameters: e.target.value }))}
              placeholder="np. item_id, value, currency"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          <Field label="Meta event (opcjonalnie)">
            <input
              value={form.meta_event}
              onChange={(e) => setForm((f) => ({ ...f, meta_event: e.target.value }))}
              placeholder="np. Purchase"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          <Field label="TikTok event (opcjonalnie)">
            <input
              value={form.tiktok_event}
              onChange={(e) => setForm((f) => ({ ...f, tiktok_event: e.target.value }))}
              placeholder="np. CompletePayment"
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }}
            />
          </Field>

          {error && (
            <div className="text-xs px-3 py-2" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", color: "var(--error)", borderRadius: R }}>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1" style={{ borderTop: "1px solid var(--border)", marginTop: "4px", paddingTop: "16px" }}>
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: R, background: "transparent" }}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 text-sm px-4 py-2 font-semibold"
              style={{ background: saving ? "var(--surface-elevated)" : "var(--accent)", color: saving ? "var(--text-muted)" : "#000000", borderRadius: R, opacity: saving ? 0.7 : 1 }}
            >
              {saving && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
              {saving ? "Dodawanie..." : "Dodaj"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-10 flex flex-col items-center gap-3 text-center" style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "4px" }}>
      <div className="w-12 h-12 flex items-center justify-center" style={{ background: "var(--surface-elevated)", color: "var(--text-muted)", borderRadius: "4px" }}>{icon}</div>
      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="text-xs max-w-xs" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>{description}</p>
    </div>
  );
}
