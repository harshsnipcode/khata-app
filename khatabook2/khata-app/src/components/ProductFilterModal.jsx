import { useEffect, useRef } from "react";

const FILTER_OPTIONS = [
  { id: "all",     label: "All Items" },
  { id: "low",     label: "Low Stock" },
];

const SORT_OPTIONS = [
  { id: "recent",  label: "Most Recent"      },
  { id: "oldest",  label: "Oldest"           },
  { id: "highest", label: "Highest Stock"    },
  { id: "lowest",  label: "Lowest Stock"     },
  { id: "az",      label: "By Name (A → Z)"  },
];

function getFilterIcon(id, active) {
  const color = active ? "text-[var(--primary)]" : "text-[var(--text-secondary)]";
  switch(id) {
    case "all":
      return (
        <svg className={`w-4 h-4 ${color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      );
    case "low":
      return (
        <svg className="w-4 h-4 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

function ProductFilterModal({
  selectedFilter,
  setSelectedFilter,
  selectedSort,
  setSelectedSort,
  onApply,
  onClose,
}) {
  const sheetRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleReset = () => {
    setSelectedFilter("all");
    setSelectedSort("recent");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#2d3436]/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] border-b-0 rounded-t-[2rem] shadow-2xl overflow-hidden animate-sheet-up relative"
      >
        <div className="flex justify-center pt-3.5 pb-1">
          <div className="w-12 h-1 rounded-full bg-[#dee2e6]" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]">
          <button onClick={handleReset} className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">Reset</button>
          <h2 className="text-[var(--text-primary)] font-bold text-base tracking-tight">Filter & Sort Products</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--border)]/45 cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Filter By</p>
            <div className="grid grid-cols-2 gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const active = selectedFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedFilter(opt.id)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 text-left cursor-pointer outline-none ${
                      active
                        ? opt.id === 'low'
                          ? "bg-[var(--secondary)] border-[var(--danger)]/30 text-[var(--danger)]"
                          : "bg-[var(--primary-light)] border-[var(--primary)]/30 text-[var(--primary)]"
                        : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="shrink-0">{getFilterIcon(opt.id, active)}</span>
                    <span className="flex-1 truncate">{opt.label}</span>
                    {active && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.id === 'low' ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Sort By</p>
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)] bg-[var(--background)]">
              {SORT_OPTIONS.map((opt) => {
                const active = selectedSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedSort(opt.id)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-colors duration-200 cursor-pointer outline-none ${
                      active ? "bg-[var(--primary-light)] text-[var(--primary)]" : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/40"
                    }`}
                  >
                    <span className="font-bold">{opt.label}</span>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${active ? "border-[var(--primary)]" : "border-[var(--border)]"}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--background)]">
          <button
            onClick={onApply}
            className="w-full py-4 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs tracking-widest uppercase transition-all duration-200 active:scale-[0.98] shadow-md shadow-[var(--primary)]/10 cursor-pointer outline-none"
          >
            View Results
          </button>
        </div>
      </div>
      <style>{`
        @keyframes sheet-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-sheet-up { animation: sheet-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
}

export default ProductFilterModal;

