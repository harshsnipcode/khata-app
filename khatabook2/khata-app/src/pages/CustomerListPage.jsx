import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";

const CACHE_KEY = "khata_contact_cache";

// ── helpers ──────────────────────────────────────────────
function isContactsApiSupported() {
  return (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window
  );
}

function normaliseContacts(raw) {
  return raw
    .filter((c) => c.name && c.name[0])
    .map((c, i) => ({
      id: i,
      name: Array.isArray(c.name) ? c.name[0] : c.name,
      phone: c.tel?.[0] || c.phone?.[0] || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── component ────────────────────────────────────────────
function CustomerListPage() {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permState, setPermState] = useState("idle"); // idle | requesting | granted | denied | unsupported
  const navigate = useNavigate();

  // ── Bootstrap: load from cache, then decide UX state ──
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContacts(parsed);
          setPermState("granted");
          setLoading(false);
          return;
        }
      } catch { /* bad cache, continue */ }
    }

    if (!isContactsApiSupported()) {
      setPermState("unsupported");
      setLoading(false);
      return;
    }

    // API is supported but we have no cached contacts yet → show prompt
    setPermState("idle");
    setLoading(false);
  }, []);

  // ── Read contacts via getAll (no picker UI) ──
  const readContacts = useCallback(async () => {
    setLoading(true);
    setPermState("requesting");
    try {
      // getAll reads every contact without a picker dialog.
      // Supported in Chrome 94+ on Android with the Contact Picker API flag or
      // natively available through the Contacts API on some builds.
      // Falls back gracefully if not available.
      const props = ["name", "tel"];
      let raw = [];

      if (typeof navigator.contacts.getAll === "function") {
        raw = await navigator.contacts.getAll(props);
      } else {
        // Older Chrome: select() with multiple=true – user picks, but we pick all
        raw = await navigator.contacts.select(props, { multiple: true });
      }

      const formatted = normaliseContacts(raw);
      setContacts(formatted);
      localStorage.setItem(CACHE_KEY, JSON.stringify(formatted));
      setPermState("granted");
    } catch (err) {
      console.warn("[Contacts] Error reading contacts:", err);
      // If permission was denied or the user cancelled, reflect that
      if (err?.name === "SecurityError" || err?.message?.toLowerCase().includes("permission")) {
        setPermState("denied");
      } else {
        // User cancelled or other error – stay on idle so they can try again
        setPermState("idle");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Refresh (clear cache, re-read) ──
  const handleRefresh = useCallback(async () => {
    localStorage.removeItem(CACHE_KEY);
    setContacts([]);
    await readContacts();
  }, [readContacts]);

  // ── Navigate to form with pre-filled data ──
  const handleSelect = useCallback((contact) => {
    navigate("/party/new", { state: { name: contact.name, phone: contact.phone } });
  }, [navigate]);

  // ── Filtered list ──
  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.phone && c.phone.includes(query))
  );

  // ── Render ──
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none animate-fade-in">
      <div className="relative z-10 max-w-3xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Select Contact
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            Cancel
          </button>
        </div>

        {/* ── Search + actions bar ── */}
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts by name or phone…"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-11 pr-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
            />
          </div>

          {contacts.length > 0 && (
            <button
              onClick={handleRefresh}
              className="bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-4 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 active:scale-95 cursor-pointer outline-none flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Sync</span>
            </button>
          )}

          <Link
            to="/party/new"
            className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-black px-6 py-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-95 text-xs uppercase tracking-widest text-center shadow-md flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Manually</span>
          </Link>
        </div>

        {/* ── Body ── */}
        <div className="space-y-3">

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 w-36 bg-slate-700/30 rounded" />
                    <div className="h-3 w-24 bg-slate-700/20 rounded" />
                  </div>
                  <div className="h-8 w-16 bg-slate-700/20 rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {/* API not supported */}
          {!loading && permState === "unsupported" && (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-16 text-center space-y-4 px-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] font-bold text-sm">
                Contacts access is not supported on this device
              </p>
              <p className="text-[var(--text-muted)] text-xs max-w-xs mx-auto leading-relaxed">
                Use the Add Manually button to create a party.
              </p>
            </div>
          )}

          {/* Permission denied */}
          {!loading && permState === "denied" && (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-16 text-center space-y-4 px-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] font-bold text-sm">
                Contacts permission denied
              </p>
              <p className="text-[var(--text-muted)] text-xs max-w-xs mx-auto leading-relaxed">
                Please allow contacts access in your device settings and try again.
              </p>
              <button
                onClick={readContacts}
                className="inline-flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-5 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer outline-none mx-auto"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Idle — no contacts yet */}
          {!loading && permState === "idle" && contacts.length === 0 && (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-16 text-center space-y-5 px-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--text-primary)] font-bold text-sm">
                  Import your contacts
                </p>
                <p className="text-[var(--text-muted)] text-xs max-w-xs mx-auto leading-relaxed mt-1.5">
                  Your contacts will be displayed here — nothing leaves this app.
                </p>
              </div>
              <button
                onClick={readContacts}
                className="inline-flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-6 py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer outline-none mx-auto shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Give Access to Contacts</span>
              </button>
            </div>
          )}

          {/* Requesting permission (transitional) */}
          {!loading && permState === "requesting" && (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-16 text-center space-y-4">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" />
              <p className="text-[var(--text-secondary)] font-bold text-sm">
                Reading contacts…
              </p>
            </div>
          )}

          {/* No results for query */}
          {!loading && permState === "granted" && contacts.length > 0 && filtered.length === 0 && (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-12 text-center text-[var(--text-secondary)] font-bold text-sm">
              No contacts match your search
            </div>
          )}

          {/* Contact list */}
          {!loading && permState === "granted" && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="card rounded-2xl p-4 flex items-center justify-between hover:card-hover hover:scale-[1.005] transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar initial */}
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)] font-black text-sm shrink-0 select-none">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--text-primary)] text-sm truncate">
                        {c.name}
                      </div>
                      {c.phone && (
                        <div className="text-[var(--text-secondary)] text-xs mt-0.5 font-medium">
                          {c.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelect(c)}
                    className="ml-3 shrink-0 bg-[var(--primary-light)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider border border-[var(--primary)]/20 transition-all duration-200 cursor-pointer outline-none active:scale-95 shadow-sm"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default CustomerListPage;
