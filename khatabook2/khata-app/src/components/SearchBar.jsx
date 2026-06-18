function SearchBar({ searchTerm, setSearchTerm, onOpenFilter, activeCount = 0 }) {
  return (
    <div className="flex items-center gap-2">
      {/* Search input */}
      <div className="flex-1 relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none select-none"
          style={{ color: "#b2bec3" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-xl pl-9 pr-8 py-2.5 text-sm transition-all duration-200 focus:outline-none"
          style={{
            background: "#fff",
            border: "1px solid #e9ecef",
            color: "#2d3436",
            fontSize: "13px",
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "#5cbdb9";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(92,189,185,0.12)";
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = "#e9ecef";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors cursor-pointer"
            style={{ color: "#b2bec3" }}
            onMouseEnter={e => e.currentTarget.style.color = "#636e72"}
            onMouseLeave={e => e.currentTarget.style.color = "#b2bec3"}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter button */}
      <button
        onClick={onOpenFilter}
        className="relative flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer outline-none active:scale-95"
        style={
          activeCount > 0
            ? {
                background: "#ebf6f5",
                border: "1px solid #5cbdb9",
                color: "#5cbdb9",
              }
            : {
                background: "#fff",
                border: "1px solid #e9ecef",
                color: "#636e72",
              }
        }
        onMouseEnter={e => {
          if (activeCount === 0) {
            e.currentTarget.style.borderColor = "#5cbdb9";
            e.currentTarget.style.color = "#5cbdb9";
          }
        }}
        onMouseLeave={e => {
          if (activeCount === 0) {
            e.currentTarget.style.borderColor = "#e9ecef";
            e.currentTarget.style.color = "#636e72";
          }
        }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Filters</span>
        {activeCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full text-[8px] font-black flex items-center justify-center border-2 border-white animate-pulse-soft"
            style={{ background: "#5cbdb9", color: "#fff" }}
          >
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default SearchBar;
