import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// Simple mock contacts for selection. Replace with platform contacts integration later.
const MOCK_CONTACTS = [
  { id: 1, name: "Rahul Sharma", phone: "9876543210" },
  { id: 2, name: "Amit Kumar", phone: "9123456780" },
  { id: 3, name: "Sneha Patel", phone: "9988776655" },
];

function CustomerListPage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const filtered = MOCK_CONTACTS.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query));

  const handleSelect = (contact) => {
    // Navigate to party/new with prefilled state
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
          {/* Search Contacts Bar */}
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

        {/* Contacts List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] py-12 text-center text-[var(--text-secondary)] font-bold text-sm">
              No contacts match your query
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
