function SearchBar({ searchTerm, setSearchTerm, onOpenFilter, activeCount = 0, collectionMode = false, toggleCollectionMode }) {
  return (
    <div className="flex items-center gap-2">
      {/* Merged Search + Filter container */}
      <div
        className="flex-[7] flex items-center rounded-xl overflow-hidden border transition-all"
        style={{
          background: "#fff",
          borderColor: activeCount > 0 ? "#5cbdb9" : "#e9ecef",
        }}
        onMouseEnter={e => {
          if (activeCount === 0) e.currentTarget.style.borderColor = "#5cbdb9";
        }}
        onMouseLeave={e => {
          if (activeCount === 0) e.currentTarget.style.borderColor = "#e9ecef";
        }}
      >
        {/* Search icon */}
        <span className="pl-3 shrink-0 pointer-events-none select-none" style={{ color: "#b2bec3" }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        {/* Search input */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search"
          className="flex-1 py-2.5 pl-2 pr-1 text-sm focus:outline-none min-w-0"
          style={{ background: "transparent", color: "#2d3436", fontSize: "13px" }}
        />

        {/* Clear button */}
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="shrink-0 p-0.5 mr-0.5 rounded-full transition-colors cursor-pointer"
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

        {/* Vertical divider */}
        <div className="w-px h-5 shrink-0" style={{ background: activeCount > 0 ? "#5cbdb9" : "#e9ecef" }} />

        {/* Filters button */}
        <button
          onClick={onOpenFilter}
          className="relative flex items-center justify-center gap-1 px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer outline-none active:scale-95 shrink-0"
          style={{ color: activeCount > 0 ? "#5cbdb9" : "#636e72" }}
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
      </div>

      {/* Collection Mode toggle */}
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
