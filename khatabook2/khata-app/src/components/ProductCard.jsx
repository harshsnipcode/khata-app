import { useNavigate } from "react-router-dom";

function ProductCard({ product, isAdmin }) {
  const navigate = useNavigate();
  const isLowStock = product.stock_quantity <= product.low_stock_limit;

  return (
    <div className="card rounded-2xl p-4 shadow-md hover:card-hover hover:scale-[1.01] hover:shadow-lg transition-all duration-300 relative group flex flex-col justify-between">
      <div className="flex gap-4 cursor-pointer" onClick={() => navigate(`/product/${product.id}`)}>
        {/* Product Image or SVG Icon */}
        <div className="w-16 h-16 rounded-xl bg-[var(--primary-light)] border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-300">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <svg className="w-7 h-7 text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[var(--text-primary)] font-bold text-base truncate group-hover:text-[var(--primary)] transition-colors duration-200">{product.name}</h3>
          <p className="text-[var(--text-secondary)] text-xs font-medium mt-0.5">Sale: ₹{new Intl.NumberFormat("en-IN").format(product.sale_price)}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
              isLowStock 
                ? 'bg-[var(--secondary)] border-[var(--danger)]/20 text-[var(--danger)]' 
                : 'bg-[var(--primary-light)] border-[var(--primary)]/20 text-[var(--primary)]'
            }`}>
              Stock: {product.stock_quantity} {product.unit}
            </span>
            {isLowStock && (
              <span className="bg-[var(--secondary)] text-[var(--danger)] text-[9px] px-1.5 py-0.5 rounded border border-[var(--danger)]/30 font-black uppercase tracking-wider animate-pulse-soft">
                Low
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/product/${product.id}/stock-in`)}
          className="bg-[var(--primary-light)] border border-[var(--primary)]/20 text-[var(--primary)] py-2.5 rounded-xl text-[10px] font-bold hover:bg-[var(--primary-hover)]/10 transition-all duration-200 uppercase tracking-widest cursor-pointer outline-none active:scale-95 flex items-center justify-center gap-1"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Stock In</span>
        </button>
        <button
          onClick={() => navigate(`/product/${product.id}/stock-out`)}
          className="bg-[var(--secondary)] border border-[var(--danger)]/20 text-[var(--danger)] py-2.5 rounded-xl text-[10px] font-bold hover:bg-[#fcd5dc] transition-all duration-200 uppercase tracking-widest cursor-pointer outline-none active:scale-95 flex items-center justify-center gap-1"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Stock Out</span>
        </button>
      </div>
    </div>
  );
}

export default ProductCard;

