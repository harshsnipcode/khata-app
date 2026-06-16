import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function CustomerForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState(state?.name || "");
  const [phone, setPhone] = useState(state?.phone || "");
  const [type, setType] = useState("customer");
  const [gst, setGst] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState([]);
  const [customPrices, setCustomPrices] = useState({});
  const [showPricing, setShowPricing] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      const { data } = await supabase.from("products").select("id, name, sale_price").order("name");
      if (data) setProducts(data);
    };
    loadProducts();
  }, []);

  const handleCustomPriceChange = (productId, value) => {
    setCustomPrices((prev) => {
      const next = { ...prev };
      if (value === "" || Number(value) < 0) {
        delete next[productId];
      } else {
        next[productId] = Number(value);
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setMessage("");
    setSubmitting(true);

    try {
      const user = await supabase.auth.getUser();
      const created_by = user?.data?.user?.id || 'admin';

      const { data, error } = await offlineSupabase.from("customers").insert([
        { name, phone, type, created_by },
      ]).select();

      if (error) throw error;

      const inserted = Array.isArray(data) ? data[0] : data;
      const newId = inserted?.id;

      if (newId) {
        const priceEntries = Object.entries(customPrices);
        if (priceEntries.length > 0) {
          const rows = priceEntries.map(([productId, customPrice]) => ({
            customer_id: newId,
            product_id: Number(productId),
            custom_price: customPrice,
          }));
          const { error: priceError } = await offlineSupabase.from("customer_product_prices").insert(rows);
          if (priceError) throw priceError;
        }
        navigate(`/customer/${newId}`);
      }
    } catch (err) {
      setMessage(err.message || "Failed to create customer");
    } finally {
      setSubmitting(false);
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

        <div className="card p-6 rounded-3xl shadow-md relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60" />
          <h2 className="text-xl font-bold mb-6 tracking-tight">Add New Party</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Full Name*</label>
              <input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60"
                placeholder="e.g. Rahul Sharma"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Phone Number*</label>
              <input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60"
                placeholder="e.g. 9876543210"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1 mb-2">Party Type</label>
              <div className="flex gap-3">
                {[
                  { id: "customer", label: "Customer" },
                  { id: "supplier", label: "Supplier" }
                ].map((opt) => {
                  const active = type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setType(opt.id)}
                      className={`flex-1 py-3 rounded-2xl text-xs font-bold transition-all duration-300 uppercase tracking-wider border cursor-pointer outline-none active:scale-[0.98] ${
                        active
                          ? "bg-emerald-500 text-slate-950 border-transparent font-black shadow-lg shadow-emerald-500/10"
                          : "bg-slate-950/30 text-slate-400 border-white/5 hover:border-white/12 hover:text-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">GSTIN (Optional)</label>
              <input 
                value={gst} 
                onChange={(e) => setGst(e.target.value)} 
                className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60 font-mono uppercase"
                placeholder="e.g. 07AAAAA1111A1Z1"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">Billing Address (Optional)</label>
              <textarea 
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                rows="3"
                className="w-full bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60"
                placeholder="Enter address details..."
              />
            </div>

            {/* Special Pricing Section */}
            <div className="border-t border-white/5 pt-5">
              <button
                type="button"
                onClick={() => setShowPricing(!showPricing)}
                className="flex items-center justify-between w-full cursor-pointer outline-none active:scale-[0.99]"
              >
                <span className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider">
                  Special Pricing <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">(Optional)</span>
                </span>
                <svg className={`w-4 h-4 text-[var(--text-secondary)] transition-transform duration-300 ${showPricing ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showPricing && (
                <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                  {products.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-xs italic py-3 text-center">No products yet. Add products from catalogue first.</p>
                  ) : (
                    products.map((product) => {
                      const customVal = customPrices[product.id];
                      return (
                        <div key={product.id} className="flex items-center gap-3 bg-slate-950/20 rounded-xl px-4 py-3 border border-white/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{product.name}</p>
                            <p className="text-[var(--text-muted)] text-[10px] font-medium">
                              Default: <span className="text-emerald-400 font-bold">₹{new Intl.NumberFormat("en-IN").format(product.sale_price)}</span>
                            </p>
                          </div>
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={customVal !== undefined ? customVal : ""}
                              onChange={(e) => handleCustomPriceChange(product.id, e.target.value)}
                              placeholder="Default"
                              className="w-full bg-slate-950/40 border border-white/8 rounded-xl pl-7 pr-3 py-2.5 text-white text-xs font-bold text-right placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all duration-200"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {message && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold p-4 rounded-2xl">
                {message}
              </div>
            )}

            <button 
              type="submit" 
              disabled={submitting} 
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-4.5 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-lg shadow-emerald-500/10 disabled:opacity-50 mt-2"
            >
              {submitting ? "Creating Party..." : "Create Party"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CustomerForm;
