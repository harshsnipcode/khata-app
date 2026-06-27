function SearchBar({ searchTerm, setSearchTerm, onOpenFilter, activeCount = 0, collectionMode = false, toggleCollectionMode }) {
  return (
    <div className="flex items-center gap-2">
      {/* Search input — ~50-55% */}
      <div className="flex-[5] relative min-w-0">
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
          placeholder="Search"
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

      {/* Filter button — ~20-22% */}
      <button
        onClick={onOpenFilter}
        className="flex-[2] relative flex items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer outline-none active:scale-95"
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
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="hidden sm:inline">Filters</span>
        {activeCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full text-[8px] font-black flex items-center justify-center border-2 border-white animate-pulse-soft"
            style={{ background: "#5cbdb9", color: "#fff" }}
          >
            {activeCount}
          </span>
        )}
      </button>

      {/* Collection Mode toggle — remaining width */}
      <div
        onClick={toggleCollectionMode}
        className="flex-[3] flex items-center gap-1.5 rounded-xl px-2 py-2.5 cursor-pointer outline-none active:scale-95 transition select-none border"
        style={{
          background: collectionMode ? "#ebf6f5" : "#fff",
          borderColor: collectionMode ? "#5cbdb9" : "#e9ecef",
        }}
      >
        <span className="text-sm shrink-0 leading-none">{collectionMode ? "📍" : "🚗"}</span>
        <span
          className="text-[10px] font-bold whitespace-nowrap truncate"
          style={{ color: collectionMode ? "#2d7a78" : "#636e72" }}
        >
          {collectionMode ? "ON" : "OFF"}
        </span>
        <div
          className="w-7 h-3.5 rounded-full relative transition-all shrink-0 ml-auto"
          style={{ background: collectionMode ? "#5cbdb9" : "#e9ecef" }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm"
            style={{ left: collectionMode ? "14px" : "2px" }}
          />
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
