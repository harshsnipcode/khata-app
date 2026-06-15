import { useEffect, useRef } from "react";

const FILTER_OPTIONS = [
  { id: "all",      label: "All",           disabled: false },
  { id: "get",      label: "You Will Get",  disabled: false },
  { id: "give",     label: "You Will Give", disabled: false },
  { id: "settled",  label: "Settled",       disabled: false },
  { id: "today",    label: "Due Today",     disabled: true  },
  { id: "upcoming", label: "Upcoming",      disabled: true  },
  { id: "nodue",    label: "No Due Date",   disabled: true  },
];

const SORT_OPTIONS = [
  { id: "recent",  label: "Most Recent"      },
  { id: "oldest",  label: "Oldest"           },
  { id: "highest", label: "Highest Amount"   },
  { id: "lowest",  label: "Least Amount"     },
  { id: "az",      label: "By Name (A → Z)"  },
];

function getFilterIcon(id, active) {
  const color = active ? "#5cbdb9" : "#b2bec3";
  const style = { color };
  switch(id) {
    case "all":
      return (
        <svg className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
        </svg>
      );
    case "get":
      return (
        <svg className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
        </svg>
      );
    case "give":
      return (
        <svg className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
        </svg>
      );
    case "settled":
      return (
        <svg className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
      );
  }
}

function FilterModal({
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
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(45,52,54,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-lg rounded-t-[2rem] shadow-2xl overflow-hidden animate-sheet-up relative"
        style={{ background: "#fff", border: "1px solid #e9ecef", borderBottom: "none" }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3.5 pb-1">
          <div className="w-12 h-1 rounded-full" style={{ background: "#dee2e6" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "#e9ecef" }}
        >
          <button
            onClick={handleReset}
            className="text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{ color: "#636e72" }}
            onMouseEnter={e => e.currentTarget.style.color = "#2d3436"}
            onMouseLeave={e => e.currentTarget.style.color = "#636e72"}
          >
            Reset
          </button>
          <h2 className="font-bold text-base" style={{ color: "#2d3436" }}>Filter &amp; Sort</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full transition-colors cursor-pointer"
            style={{ color: "#b2bec3" }}
            onMouseEnter={e => e.currentTarget.style.color = "#2d3436"}
            onMouseLeave={e => e.currentTarget.style.color = "#b2bec3"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Filter By */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#b2bec3" }}>
              Filter By
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const active = selectedFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && setSelectedFilter(opt.id)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-semibold uppercase tracking-wider border transition-all duration-150 text-left cursor-pointer outline-none"
                    style={
                      opt.disabled
                        ? { opacity: 0.4, cursor: "not-allowed", background: "#f8f9fa", border: "1px solid #e9ecef", color: "#b2bec3" }
                        : active
                        ? { background: "#ebf6f5", border: "1px solid #5cbdb9", color: "#5cbdb9" }
                        : { background: "#fff", border: "1px solid #e9ecef", color: "#636e72" }
                    }
                  >
                    <span className="shrink-0">{getFilterIcon(opt.id, active)}</span>
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.disabled && (
                      <span className="text-[8px] border rounded px-1 py-0.5 font-bold tracking-wider shrink-0"
                        style={{ color: "#b2bec3", borderColor: "#dee2e6" }}>
                        SOON
                      </span>
                    )}
                    {active && !opt.disabled && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#5cbdb9" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#b2bec3" }}>
              Sort By
            </p>
            <div className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: "#e9ecef" }}>
              {SORT_OPTIONS.map((opt) => {
                const active = selectedSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedSort(opt.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-150 cursor-pointer outline-none"
                    style={
                      active
                        ? { background: "#ebf6f5", color: "#5cbdb9" }
                        : { background: "#fff", color: "#636e72" }
                    }
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f8f9fa"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "#fff"; }}
                  >
                    <span>{opt.label}</span>
                    <span
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                      style={{ borderColor: active ? "#5cbdb9" : "#dee2e6" }}
                    >
                      {active && (
                        <span className="w-2 h-2 rounded-full" style={{ background: "#5cbdb9" }} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 py-4 border-t" style={{ borderColor: "#e9ecef" }}>
          <button
            onClick={onApply}
            className="w-full py-4 rounded-2xl font-bold text-sm tracking-wide uppercase transition-all duration-200 active:scale-[0.98] cursor-pointer outline-none"
            style={{ background: "#5cbdb9", color: "#fff" }}
            onMouseEnter={e => e.currentTarget.style.background = "#4aa8a4"}
            onMouseLeave={e => e.currentTarget.style.background = "#5cbdb9"}
          >
            View Results
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-sheet-up { animation: sheet-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
}

export default FilterModal;
