"use client";

import { useState, useMemo, useCallback } from "react";
import type { GtmAccount } from "@/app/api/gtm/accounts-list/route";

const R = "4px";

export function GTMAccountsTab() {
  const [accounts, setAccounts] = useState<GtmAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noGTM, setNoGTM] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedWhitelist, setSavedWhitelist] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const isDirty = useMemo(() => {
    const savedSet = new Set(savedWhitelist);
    if (selected.size !== savedSet.size) return true;
    for (const id of selected) if (!savedSet.has(id)) return true;
    return false;
  }, [selected, savedWhitelist]);

  const fetchAll = useCallback(async () => {
    setError(null); setNoGTM(false); setLoading(true); setSavedOk(false);
    try {
      const res = await fetch("/api/gtm/accounts-list");
      if (res.status === 404) { setNoGTM(true); return; }
      if (!res.ok) { const data = await res.json() as { error?: string }; setError(data.error ?? "Unknown error"); return; }
      const data = await res.json() as { accounts: GtmAccount[] };
      setAccounts(data.accounts);
      const wl = data.accounts.filter((a) => a.isWhitelisted).map((a) => a.accountId);
      setSavedWhitelist(wl);
      setSelected(new Set(wl));
      setLoaded(true);
    } catch {
      setError("Nie udało się załadować listy kont.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = (accountId: string) => {
    setSaveError(null); setSavedOk(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSaveError(null); setSavedOk(false);
    setSelected(new Set(filtered.map((a) => a.accountId)));
  };

  const handleSave = async () => {
    setSaveLoading(true); setSaveError(null); setSavedOk(false);
    try {
      const allSelected = accounts.every((a) => selected.has(a.accountId));
      const toSave = allSelected ? [] : Array.from(selected);
      const res = await fetch("/api/gtm/account-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) { const data = await res.json() as { error?: string }; setSaveError(data.error ?? "Nie udało się zapisać."); return; }
      setSavedWhitelist(toSave); setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      setSaveError("Błąd połączenia. Spróbuj ponownie.");
    } finally {
      setSaveLoading(false);
    }
  };

  const filtered = useMemo(() =>
    accounts.filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.accountId.includes(search)),
    [accounts, search]
  );

  const selectedInFiltered = filtered.filter((a) => selected.has(a.accountId)).length;

  if (noGTM) {
    return (
      <EmptyState
        icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
        title="Brak połączenia z GTM"
        description='Połącz konto Google Tag Manager w zakładce "Autoryzacja".'
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Szukaj konta..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: R }} />
        </div>

        <button onClick={fetchAll} disabled={loading} className="flex items-center gap-2 text-sm px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: loading ? 0.5 : 1, borderRadius: R }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? "spin 1s linear infinite" : undefined }}>
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Odśwież
        </button>
      </div>

      {error && <div className="px-4 py-3 text-sm" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", color: "var(--error)", borderRadius: R }}>{error}</div>}

      {loading && !error && (
        <div className="flex items-center justify-center py-16 gap-3" style={{ color: "var(--text-muted)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          <span className="text-sm">Ładowanie kont...</span>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <>
          <div style={{ border: "1px solid var(--border)", borderRadius: R, overflow: "hidden" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every((a) => selected.has(a.accountId))}
                      onChange={handleSelectAll}
                      className="cursor-pointer"
                      style={{ accentColor: "var(--accent)" }}
                    />
                  </th>
                  <Th>Konto GTM</Th>
                  <Th>ID konta</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={3} className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Brak wyników</td></tr>
                ) : (
                  filtered.map((a, i) => {
                    const isSelected = selected.has(a.accountId);
                    return (
                      <tr key={a.accountId} onClick={() => handleToggle(a.accountId)} className="cursor-pointer"
                        style={{
                          background: isSelected
                            ? (i % 2 === 0 ? "rgba(114,13,214,0.03)" : "rgba(114,13,214,0.05)")
                            : (i % 2 === 0 ? "var(--background)" : "var(--surface)"),
                          borderBottom: "1px solid var(--border)",
                        }}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => handleToggle(a.accountId)} className="cursor-pointer" style={{ accentColor: "var(--accent)" }} />
                        </td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{a.name}</span>
                            {isSelected && <span className="px-1.5 py-0.5 text-xs font-medium flex-shrink-0" style={{ background: "var(--accent-subtle)", color: "var(--accent)", borderRadius: "3px", border: "1px solid rgba(114,13,214,0.2)" }}>Aktywny</span>}
                          </div>
                        </Td>
                        <Td>
                          <span className="px-2 py-0.5 text-xs" style={{ background: "var(--surface-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", borderRadius: "3px" }}>{a.accountId}</span>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Wybrano {selectedInFiltered} z {filtered.length} kont
            </p>
            <div className="flex items-center gap-3">
              {saveError && <span className="text-xs" style={{ color: "var(--error)" }}>{saveError}</span>}
              {savedOk && (
                <span className="text-xs flex items-center gap-1" style={{ color: "var(--success)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  Zapisano
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty || saveLoading}
                className="flex items-center gap-2 text-sm px-4 py-2 font-semibold"
                style={{ background: isDirty ? "var(--accent)" : "var(--surface-elevated)", color: isDirty ? "#000000" : "var(--text-muted)", borderRadius: R, opacity: saveLoading ? 0.6 : 1, cursor: isDirty ? "pointer" : "default" }}
                onMouseEnter={(e) => { if (isDirty && !saveLoading) e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isDirty ? "var(--accent)" : "var(--surface-elevated)"; }}
              >
                {saveLoading && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
                {saveLoading ? "Zapisywanie..." : "Zapisz wybór"}
              </button>
            </div>
          </div>

          <p className="text-xs" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
            Wybierz, które konta GTM aplikacja może odpytywać. Brak wyboru = odpytywane są wszystkie konta (może powodować przekroczenie limitów). Skonfiguruj to najpierw, a następnie zarządzaj dostępem do kontenerów w zakładce Kontenery.
          </p>
        </>
      )}

      {!loaded && !loading && !error && (
        <EmptyState
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>}
          title="Konta nie załadowane"
          description="Kliknij Odśwież, aby załadować konta GTM."
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
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
