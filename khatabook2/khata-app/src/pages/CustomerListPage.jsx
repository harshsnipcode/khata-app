import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const STORAGE_KEY = "khata_synced_contacts";

function CustomerListPage() {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      if (!("contacts" in navigator) || !("ContactsManager" in window)) {
        setFallback(true);
        setLoading(false);
        return;
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setContacts(JSON.parse(stored));
          setLoading(false);
          return;
        } catch {}
      }

      let permState = "prompt";
      try {
        const status = await navigator.permissions.query({ name: "contacts" });
        permState = status.state;
      } catch {}

      if (permState === "denied") {
        setFallback(true);
        setLoading(false);
        return;
      }

      try {
        const props = await navigator.contacts.select(["name", "tel"], { multiple: true });
        const formatted = props
          .filter((c) => c.name)
          .map((c, i) => ({
            id: i,
            name: c.name,
            phone: (c.tel && c.tel[0]) || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setContacts(formatted);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
      } catch (err) {
        if (err.name === "NotAllowedError") {
          setFallback(true);
        }
      }
      setLoading(false);
    };

    load();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const props = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const formatted = props
        .filter((c) => c.name)
        .map((c, i) => ({
          id: i,
          name: c.name,
          phone: (c.tel && c.tel[0]) || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setContacts(formatted);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
    } catch {}
    setLoading(false);
  };

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.phone && c.phone.includes(query))
  );

  const handleSelect = (contact) => {
    navigate("/party/new", { state: { name: contact.name, phone: contact.phone } });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none animate-fade-in">

      <div className="relative z-10 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Select Contact</h1>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            Cancel
          </button>
        </div>

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
            <span>Add Customer</span>
          </Link>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4.5 flex items-center justify-between animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 w-36 bg-slate-700/30 rounded" />
                    <div className="h-3 w-24 bg-slate-700/20 rounded" />
                  </div>
                  <div className="h-8 w-16 bg-slate-700/20 rounded-xl" />
                </div>
              ))}
            </div>
          ) : fallback ? (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-12 text-center space-y-4">
              <p className="text-[var(--text-secondary)] font-bold text-sm">
                {!("contacts" in navigator)
                  ? "Contacts access is not available on this device."
                  : "Contacts permission was denied."}
              </p>
              <p className="text-[var(--text-muted)] text-xs">
                You can manually add a customer instead.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-12 text-center text-[var(--text-secondary)] font-bold text-sm">
              {contacts.length === 0
                ? "No contacts selected"
                : "No contacts match your query"}
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className="card rounded-2xl p-4.5 flex items-center justify-between hover:card-hover hover:scale-[1.005] transition-all duration-200 group"
              >
                <div>
                  <div className="font-bold text-[var(--text-primary)] transition-colors duration-200 text-base">{c.name}</div>
                  <div className="text-[var(--text-secondary)] text-xs mt-1 font-medium">{c.phone}</div>
                </div>
                <button
                  onClick={() => handleSelect(c)}
                  className="bg-[var(--primary-light)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider border border-[var(--primary)]/20 transition-all duration-200 cursor-pointer outline-none active:scale-95 shadow-sm"
                >
                  Select
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerListPage;
