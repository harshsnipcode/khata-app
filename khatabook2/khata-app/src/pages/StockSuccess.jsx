import { useNavigate, useLocation, useParams } from "react-router-dom";

function StockSuccess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const getHomePath = () => {
    const role = localStorage.getItem("khata_role");
    if (role === "admin") return "/admin/home";
    if (role === "employee") return "/employee/home";
    return "/home";
  };
  const { quantity = 0, type = "stock_in", productName = "Product", unit = "PCS" } = location.state || {};

  const title = type === "stock_in" ? "Stock Increased" : "Stock Decreased";
  const colorClass = type === "stock_in" ? "text-emerald-400" : "text-rose-400";
  const icon = type === "stock_in" ? "+" : "-";

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 text-[var(--text-primary)] flex items-center justify-center relative overflow-hidden select-none">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none translate-x-1/2 translate-y-1/2" />

      <div className="max-w-md w-full card p-8 rounded-[2.5rem] shadow-md text-center relative z-10 animate-scale-in">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60 rounded-t-[2.5rem]" />
        
        <div className="mb-8 relative z-10">
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.15)] animate-pulse-soft">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-slate-500 uppercase tracking-[0.3em] text-[10px] font-black mb-4 pl-1">Inventory Updated</p>
          <h1 className={`text-4xl font-black mb-2 tracking-tight ${colorClass}`}>
            {icon}{quantity} {unit}
          </h1>
          <p className="text-[var(--text-primary)] text-lg font-bold tracking-tight">{productName}</p>
          <p className="text-[var(--text-secondary)] text-sm font-medium mt-2">{title} successfully.</p>
        </div>

        <div className="grid gap-3 relative z-10">
          <button
            onClick={() => navigate(getHomePath(), { replace: true, state: { activeTab: "catalogue" } })}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-4.5 rounded-2xl text-xs uppercase tracking-widest transition-all duration-300 active:scale-95 shadow-lg shadow-emerald-500/5 cursor-pointer outline-none"
          >
            Done
          </button>
          <button
            onClick={() => navigate(`/product/${id}/stock-in`)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] py-4.5 rounded-2xl text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest transition-all duration-200 active:scale-95 cursor-pointer outline-none"
          >
            Add More Stock
          </button>
        </div>
      </div>
    </div>
  );
}

export default StockSuccess;
