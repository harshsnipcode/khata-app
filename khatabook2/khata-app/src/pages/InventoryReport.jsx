import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";

function InventoryReport() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortType, setSortType] = useState("highest-value");

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (!error) setProducts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
    const channel = supabase
      .channel("inventory-report-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadProducts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const metrics = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    products.forEach((p) => {
      const qty = Number(p.stock_quantity);
      totalUnits += qty;
      totalValue += qty * Number(p.sale_price);
      if (qty <= Number(p.low_stock_limit)) lowStockCount++;
    });
    return { totalProducts: products.length, totalUnits, totalValue, lowStockCount };
  }, [products]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_limit));
  }, [products]);

  const displayedProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const valA = Number(a.stock_quantity) * Number(a.sale_price);
      const valB = Number(b.stock_quantity) * Number(b.sale_price);
      if (sortType === "highest-value") return valB - valA;
      if (sortType === "lowest-value") return valA - valB;
      if (sortType === "highest-qty") return Number(b.stock_quantity) - Number(a.stock_quantity);
      if (sortType === "lowest-qty") return Number(a.stock_quantity) - Number(b.stock_quantity);
      if (sortType === "az") return a.name.localeCompare(b.name);
      return 0;
    });

    return list;
  }, [products, searchTerm, sortType]);

  const sortOptions = [
    { value: "highest-value", label: "Highest Value" },
    { value: "lowest-value", label: "Lowest Value" },
    { value: "highest-qty", label: "Highest Quantity" },
    { value: "lowest-qty", label: "Lowest Quantity" },
    { value: "az", label: "Name A-Z" },
  ];

  const formatDate = () => {
    return new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--border-hover)] transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] tracking-tight">Inventory Report</h1>
            <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">Generated on {formatDate()}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card rounded-2xl p-5 shadow-md">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold mb-1.5">Total Products</p>
            <p className="text-2xl font-black text-[var(--text-primary)]">{metrics.totalProducts}</p>
          </div>
          <div className="card rounded-2xl p-5 shadow-md">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold mb-1.5">Total Units In Stock</p>
            <p className="text-2xl font-black text-[var(--text-primary)]">{metrics.totalUnits}</p>
          </div>
          <div className="card rounded-2xl p-5 shadow-md">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold mb-1.5">Total Inventory Value</p>
            <p className="text-2xl font-black text-[var(--primary)]">₹{new Intl.NumberFormat("en-IN").format(metrics.totalValue)}</p>
          </div>
          <div className="card rounded-2xl p-5 shadow-md">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold mb-1.5">Low Stock Products</p>
            <p className={`text-2xl font-black ${metrics.lowStockCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{metrics.lowStockCount}</p>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Product..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-2xl pl-11 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-2xl px-4 py-3 text-xs font-bold text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)] transition-all cursor-pointer appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23636e72' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
              paddingRight: "36px",
            }}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Product Breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest">Product Wise Breakdown</h2>

          {loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 bg-[var(--surface)] border border-[var(--border)] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="card rounded-3xl py-16 text-center text-[var(--text-secondary)] border-dashed">
              <p className="font-bold uppercase tracking-widest">No Products Found</p>
              <p className="text-sm mt-1">Try a different search</p>
            </div>
          ) : (
            displayedProducts.map((p) => {
              const qty = Number(p.stock_quantity);
              const price = Number(p.sale_price);
              const value = qty * price;
              const isLow = qty <= Number(p.low_stock_limit);
              return (
                <div
                  key={p.id}
                  className="card rounded-2xl p-5 shadow-md hover:card-hover transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[var(--text-primary)] font-bold text-base truncate">{p.name}</h3>
                        {isLow && (
                          <span className="bg-[var(--secondary)] text-[var(--danger)] text-[9px] px-1.5 py-0.5 rounded border border-[var(--danger)]/30 font-black uppercase tracking-wider shrink-0">
                            Low
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[var(--text-secondary)] font-medium">Selling Price</span>
                          <span className="font-bold text-[var(--text-primary)]">₹{new Intl.NumberFormat("en-IN").format(price)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-[var(--text-secondary)] font-medium">Quantity</span>
                          <span className="font-bold text-[var(--text-primary)]">{qty} {p.unit}</span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-[var(--border)] flex items-center justify-between">
                          <span className="text-[var(--text-secondary)] text-sm font-medium">Total Value</span>
                          <span className="font-black text-[var(--primary)] text-lg">
                            ₹{new Intl.NumberFormat("en-IN").format(value)}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">
                          ₹{new Intl.NumberFormat("en-IN").format(price)} × {qty} = ₹{new Intl.NumberFormat("en-IN").format(value)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Low Stock Section */}
        {lowStockProducts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--danger)] uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Low Stock Products
            </h2>
            <div className="grid gap-3">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="card rounded-2xl p-4 shadow-md border border-[var(--danger)]/20" style={{ background: "var(--danger-light)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)]">{p.name}</h3>
                      <p className="text-sm text-[var(--text-secondary)] font-medium mt-0.5">
                        Stock: {p.stock_quantity} {p.unit}
                        <span className="text-[var(--danger)] font-bold"> &middot; Threshold: {p.low_stock_limit}</span>
                      </p>
                    </div>
                    <span className="bg-[var(--secondary)] text-[var(--danger)] text-[9px] px-2 py-1 rounded border border-[var(--danger)]/30 font-black uppercase tracking-wider">
                      Low
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grand Total */}
        <div className="card rounded-2xl p-6 shadow-md border-t-4 border-[var(--primary)]" style={{ borderTopColor: "var(--primary)" }}>
          <div className="space-y-2">
            {displayedProducts.map((p) => {
              const val = Number(p.stock_quantity) * Number(p.sale_price);
              return (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{p.name}</span>
                  <span className="font-semibold text-[var(--text-primary)]">₹{new Intl.NumberFormat("en-IN").format(val)}</span>
                </div>
              );
            })}
          </div>
          <hr className="my-4 border-[var(--border)]" />
          <div className="flex justify-between items-center">
            <span className="text-[var(--text-secondary)] font-bold uppercase tracking-wider text-sm">Grand Total</span>
            <span className="font-black text-[var(--primary)] text-2xl">
              ₹{new Intl.NumberFormat("en-IN").format(metrics.totalValue)}
            </span>
          </div>
        </div>

        {/* Download Report */}
        <button
          onClick={() => alert("Download Report - Coming Soon")}
          className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl transition-all text-xs uppercase tracking-widest cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Report
        </button>

      </div>
    </div>
  );
}

export default InventoryReport;
