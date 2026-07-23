import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import { requirePermission } from "../lib/permissions";

function AddProductPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [lowStockLimit, setLowStockLimit] = useState("");
  const [unit, setUnit] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    offlineSupabase.from("product_groups").select("id, name").order("name", { ascending: true }).then(({ data }) => {
      if (data) setGroups(data);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!requirePermission("add_product")) return;
    if (!name || !salePrice || !purchasePrice) {
      setError("Please fill in essential fields: Name, Sale Price, and Purchase Price.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      if (!supabase) {
        setError("Supabase client not initialized. Please refresh the page.");
        setSaving(false);
        return;
      }
      const user = await supabase.auth.getUser();
      const created_by = user?.data?.user?.id || localStorage.getItem("khata_user") || "admin";

      // 1. Create Product
      const { data: productData, error: pError } = await offlineSupabase.from("products").insert([
        {
          name,
          sale_price: Number(salePrice),
          purchase_price: Number(purchasePrice),
          stock_quantity: Number(openingStock || 0),
          low_stock_limit: Number(lowStockLimit || 0),
          unit: unit.trim() || "pcs",
          group_id: groupId ? Number(groupId) : null,
          created_by
        }
      ]).select().single();

      if (pError) throw pError;

      const product = productData;

      // 2. Create Opening Stock Transaction
      if (Number(openingStock) > 0) {
        const { error: tError } = await offlineSupabase.from("product_transactions").insert([
          {
            product_id: product.id,
            type: "stock_in",
            quantity: Number(openingStock),
            price: Number(purchasePrice),
            notes: "Opening Stock",
            created_by
          }
        ]);
        if (tError) throw tError;
      }

      navigate('/home'); // Or specific catalogue tab if handled by state
    } catch (err) {
      setError(err.message || "Failed to add product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none animate-fade-in">

      <div className="max-w-2xl mx-auto space-y-6 relative z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <h1 className="text-2xl font-black mb-8 uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(16,185,129,0.08)]">
          Add New Product
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Price and Info */}
          <div className="card rounded-3xl p-6 shadow-md space-y-5">
            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Product Name*</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                placeholder="e.g. Full Cream Milk"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Unit</label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                placeholder="e.g. pcs, kg, litre, packet"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Sale Price*</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl pl-8 pr-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm font-bold focus:bg-slate-950/60"
                    placeholder="0"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Purchase Price*</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl pl-8 pr-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm font-bold focus:bg-slate-950/60"
                    placeholder="0"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Stock configurations */}
          <div className="card rounded-3xl p-6 shadow-md space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Opening Stock</label>
                <input
                  type="number"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Low Stock Limit</label>
                <input
                  type="number"
                  value={lowStockLimit}
                  onChange={(e) => setLowStockLimit(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2 relative">
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Product Group</label>
              <div className="relative">
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm appearance-none cursor-pointer pr-10"
                >
                  <option value="" className="bg-slate-900 text-white">None</option>
                  {groups.map(g => <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>)}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold p-4 rounded-2xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-4.5 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-lg shadow-emerald-500/10 disabled:opacity-50 mt-2"
          >
            {saving ? "Creating Product..." : "Save Product"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddProductPage;
