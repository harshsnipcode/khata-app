function FloatingButton({ onClick, isVisible = true, label = "Add Customer" }) {
  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 md:bottom-6 md:right-6 font-bold py-3.5 px-5 rounded-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2 z-50 cursor-pointer outline-none text-sm"
      style={{
        background: "#5cbdb9",
        color: "#fff",
        boxShadow: "0 4px 20px rgba(92,189,185,0.35)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "#4aa8a4";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(92,189,185,0.4)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "#5cbdb9";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(92,189,185,0.35)";
      }}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default FloatingButton;
