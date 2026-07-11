import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { requirePermission } from "../lib/permissions";

function StockEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const type = location.pathname.endsWith("/stock-in") ? "stock_in" : "stock_out";
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (!error) {
        setProduct(data);
        setPrice(type === 'stock_in' ? data.purchase_price : data.sale_price);
      }
    };
    fetchProduct();
  }, [id, type]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!requirePermission("stock_entry")) return;
    if (!quantity || !price) {
      setError("Please enter quantity and price.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const user = await supabase.auth.getUser();
      const created_by = user?.data?.user?.id || localStorage.getItem("khata_user") || "admin";
      const qtyNum = Number(quantity);
      const priceNum = Number(price);

      // 1. Record Transaction
      const { error: tError } = await offlineSupabase.from("product_transactions").insert([
        {
          product_id: Number(id),
          type,
          quantity: qtyNum,
          price: priceNum,
          notes,
          created_by
        }
      ]);
      if (tError) throw tError;

      // 2. Update Product Stock
      const newStock = type === 'stock_in' 
        ? Number(product.stock_quantity) + qtyNum 
        : Number(product.stock_quantity) - qtyNum;

      const { error: pError } = await offlineSupabase.from("products").update({
        stock_quantity: newStock,
        updated_at: new Date().toISOString()
      }).eq("id", id);
      if (pError) throw pError;

      navigate(`/product/${id}/stock-success`, {
        state: { quantity: qtyNum, type, productName: product.name, unit: product.unit }
      });
    } catch (err) {
      setError(err.message || "Failed to update stock.");
    } finally {
      setSaving(false);
    }
  };

  if (!product) return <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--text-secondary)] font-bold uppercase tracking-widest animate-pulse">Initializing...</div>;

  const colorClass = type === 'stock_in' ? 'text-emerald-400' : 'text-rose-400';
  const label = type === 'stock_in' ? 'Stock In (+)' : 'Stock Out (-)';

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 text-[var(--text-primary)] relative overflow-hidden select-none animate-fade-in">

      <div className="max-w-2xl mx-auto relative z-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95 mb-6"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Back</span>
        </button>
        
        <div className="mb-8">
          <p className={`text-[10px] font-black uppercase tracking-[0.3em] mb-2 ${colorClass} text-glow-${type === 'stock_in' ? 'emerald' : 'rose'}`}>{label}</p>
          <h1 className="text-4xl font-black uppercase tracking-tight">{product.name}</h1>
          <p className="text-slate-500 font-bold mt-1 text-sm">Current Stock: {product.stock_quantity} {product.unit}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="card rounded-3xl p-6 shadow-md space-y-6">
            <div className="space-y-2">
              <label className="block text-slate-500 text-[10px] font-black uppercase tracking-widest pl-1">Quantity</label>
              <div className="flex items-center gap-4">
                 <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={`w-full bg-slate-950/40 border border-white/8 rounded-2xl px-6 py-4 text-3xl font-black focus:outline-none transition-all duration-300 focus:bg-slate-950/60 ${
                    type === 'stock_in' ? 'focus:border-emerald-500/50 text-emerald-400' : 'focus:border-rose-500/50 text-rose-400'
                  }`}
                  placeholder="0"
                  required
                />
                <span className="text-xl font-bold text-slate-500 uppercase tracking-widest shrink-0">{product.unit}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-slate-505 text-[10px] font-black uppercase tracking-widest pl-1">
                {type === 'stock_in' ? 'Purchase Rate (per unit)' : 'Sale Rate (per unit)'}
              </label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-black text-slate-500">₹</span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/8 focus:border-emerald-500/50 hover:border-white/12 rounded-2xl pl-12 pr-6 py-4 text-xl font-black text-white focus:outline-none transition-all duration-300 focus:bg-slate-950/60"
                  placeholder="0"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-slate-505 text-[10px] font-black uppercase tracking-widest pl-1">Notes / Remarks</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60 font-semibold"
                placeholder={type === 'stock_in' ? 'e.g. Received from Supplier' : 'e.g. Counter Sale'}
              />
            </div>
          </div>

          {error && (
            <div className="text-rose-400 text-xs font-bold bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`w-full py-4.5 rounded-2xl font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 text-xs outline-none cursor-pointer shadow-lg disabled:opacity-50 ${
              type === 'stock_in' 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/5' 
                : 'bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white shadow-rose-500/5'
            }`}
          >
            {saving ? "Updating Inventory..." : `Save ${type === 'stock_in' ? 'Stock In' : 'Stock Out'}`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default StockEntry;
