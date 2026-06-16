import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function EditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [lowStockLimit, setLowStockLimit] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getHomePath = () => {
    const role = localStorage.getItem("khata_role");
    if (role === "admin") return "/admin/home";
    if (role === "employee") return "/employee/home";
    return "/home";
  };

  useEffect(() => {
    const loadProduct = async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) {
        setError("Failed to load product.");
        setLoading(false);
        return;
      }
      setName(data.name);
      setSalePrice(String(data.sale_price));
      setPurchasePrice(String(data.purchase_price));
      setOpeningStock(String(data.stock_quantity || 0));
      setLowStockLimit(String(data.low_stock_limit || 0));
      setUnit(data.unit || "PCS");
      setLoading(false);
    };
    loadProduct();
  }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || !salePrice || !purchasePrice) {
      setError("Please fill in essential fields: Name, Sale Price, and Purchase Price.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!supabase) {
        setError("Supabase client not initialized. Please refresh the page.");
        setSaving(false);
        return;
      }

      const { error: uError } = await offlineSupabase.from("products").update({
        name,
        sale_price: Number(salePrice),
        purchase_price: Number(purchasePrice),
        stock_quantity: Number(openingStock || 0),
        low_stock_limit: Number(lowStockLimit || 0),
        unit,
      }).eq("id", id);

      if (uError) throw uError;

      setSuccess("Product updated successfully!");
      setTimeout(() => navigate(`/product/${id}`), 1200);
    } catch (err) {
      setError(err.message || "Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error: dError } = await offlineSupabase.from("products").delete({ id }).eq("id", id);
      if (dError) throw dError;
      setShowDeleteModal(false);
      navigate(getHomePath(), { replace: true, state: { activeTab: "catalogue" } });
    } catch (err) {
      setError(err.message || "Failed to delete product.");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--text-secondary)] font-bold uppercase tracking-widest animate-pulse">
        Loading Product...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-6 relative z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/product/${id}`)} className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <h1 className="text-2xl font-black mb-8 uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(16,185,129,0.08)]">
          Edit Product
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
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

          <div className="card rounded-3xl p-6 shadow-md space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Stock Quantity</label>
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
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Measurement Unit</label>
              <div className="relative">
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm appearance-none cursor-pointer pr-10"
                >
                  {['PCS', 'KG', 'LTR', 'BOX', 'BAG', 'PKT'].map(u => <option key={u} value={u} className="bg-slate-900 text-white">{u}</option>)}
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

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold p-4 rounded-2xl">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-4.5 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-lg shadow-emerald-500/10 disabled:opacity-50 mt-2"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>

        <hr className="border-[var(--border)]" />

        <div className="pt-2">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-black py-4.5 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none"
          >
            Delete Product
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/20 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h2 className="text-lg font-black uppercase tracking-wider text-[var(--text-primary)]">Delete Product</h2>
              <p className="text-[var(--text-secondary)] text-sm mt-2 font-medium">
                Are you sure you want to delete <span className="text-[var(--text-primary)] font-bold">{name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black py-3 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditProductPage;
