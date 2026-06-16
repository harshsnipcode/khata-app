import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function TransactionEntry() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const type = location.state?.type === "got" ? "got" : "gave";

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [customerPrices, setCustomerPrices] = useState({});

  const getEffectivePrice = (product) => {
    return customerPrices[product.id] ?? product.sale_price;
  };

  // Load customer, products, and customer-specific prices
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [custRes, prodRes, priceRes] = await Promise.all([
        supabase.from("customers").select("name, phone").eq("id", id).single(),
        supabase.from("products").select("*").order("name"),
        supabase.from("customer_product_prices").select("product_id, custom_price").eq("customer_id", id),
      ]);

      if (!custRes.error) setCustomer(custRes.data);
      if (!prodRes.error) setProducts(prodRes.data || []);
      if (!priceRes.error && priceRes.data) {
        const priceMap = {};
        priceRes.data.forEach((p) => { priceMap[p.product_id] = p.custom_price; });
        setCustomerPrices(priceMap);
      }
      setLoading(false);
    };

    loadData();
  }, [id]);

  // Calculate total amount from selected products using effective price
  const calculatedAmount = useMemo(() => {
    return Object.values(selectedProducts).reduce(
      (sum, item) => sum + ((customerPrices[item.product.id] ?? item.product.sale_price) * item.quantity),
      0
    );
  }, [selectedProducts, customerPrices]);

  // Use manual amount if provided, otherwise use calculated amount
  const finalAmount = manualAmount ? Number(manualAmount) : calculatedAmount;
  const formattedAmount = new Intl.NumberFormat("en-IN").format(finalAmount);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, searchTerm]);

  // Quantity handlers
  const handleQuantityChange = (product, newQuantity) => {
    if (newQuantity < 0) return; // Prevent negative

    // Check stock limit
    if (newQuantity > product.stock_quantity) {
      setMessage(`Only ${product.stock_quantity} ${product.unit}(s) available for ${product.name}.`);
      return;
    }

    setMessage(""); // Clear any previous message

    if (newQuantity === 0) {
      // Remove product if quantity is 0
      const updated = { ...selectedProducts };
      delete updated[product.id];
      setSelectedProducts(updated);
    } else {
      // Add or update product
      setSelectedProducts({
        ...selectedProducts,
        [product.id]: {
          product,
          quantity: newQuantity,
        },
      });
    }
  };

  // Handle save
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage("");

    if (finalAmount <= 0) {
      setMessage("Please enter an amount or select products.");
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser();
      const created_by = user?.data?.user?.id || localStorage.getItem("khata_user") || "admin";

      // 1. Create main transaction
      const { data: txn, error: txnError } = await offlineSupabase
        .from("transactions")
        .insert([
          {
            customer_id: Number(id),
            type,
            amount: finalAmount,
            created_by,
          },
        ])
        .select()
        .single();

      if (txnError) throw txnError;

      // 2. If products were selected, create transaction items and reduce stock
      if (Object.keys(selectedProducts).length > 0) {
        // Create transaction items with effective price
        const items = Object.values(selectedProducts).map((item) => ({
          transaction_id: txn.id,
          product_id: item.product.id,
          quantity: item.quantity,
          price: getEffectivePrice(item.product),
        }));

        const { error: itemsError } = await offlineSupabase.from("transaction_items").insert(items);
        if (itemsError) throw itemsError;

        // Reduce stock for each product
        for (const item of Object.values(selectedProducts)) {
          const newStock = item.product.stock_quantity - item.quantity;
          const { error: updateError } = await offlineSupabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product.id);

          if (updateError) throw updateError;
        }
      }

      navigate(`/customer/${id}/transaction/success`, {
        state: {
          amount: finalAmount,
          type,
          itemCount: Object.values(selectedProducts).length,
        },
      });
    } catch (err) {
      setMessage(err.message || "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold uppercase tracking-widest animate-pulse">
        Loading...
      </div>
    );
  }

  const headerLabel = type === "got"
    ? `You got ₹${formattedAmount} from ${customer?.name || "customer"}`
    : `You gave ₹${formattedAmount} to ${customer?.name || "customer"}`;

  const headerClass = type === "got" ? "text-emerald-400" : "text-rose-400";  return (
<div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none animate-fade-in">

      <div className="max-w-3xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <div className="space-y-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${headerClass} text-glow-${type}`}>
            {type === "got" ? "You Got" : "You Gave"}
          </p>
          <h1 className={`text-3xl font-black ${headerClass}`}>{headerLabel}</h1>
        </div>

        {/* Amount Display - Editable */}
        <div className="card rounded-3xl p-6 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3 pl-1">Total Transaction Amount</p>
          <div className="flex items-center gap-3 relative z-10">
            <span className="text-3xl font-black text-[var(--text-secondary)]">₹</span>
            <input
              type="number"
              min="0"
              step="1"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder={calculatedAmount > 0 ? String(calculatedAmount) : "0"}
              className="text-5xl font-black bg-transparent border-none text-[var(--text-primary)] focus:outline-none flex-1 placeholder-[var(--text-muted)] w-full"
            />
          </div>
          <p className="text-[var(--text-secondary)] text-xs font-semibold mt-3 pl-1">
            {manualAmount
              ? `Manual entry: ₹${formattedAmount}`
              : calculatedAmount > 0
              ? `From product total: ₹${formattedAmount}`
              : "Type manual amount or select products from catalogue below"}
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search catalogue products... (optional)"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-11 pr-4 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
          />
        </div>

        {/* Product List - Optional */}
        <div className="space-y-3">
          {products.length > 0 && (
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest pl-1">
              Select products to auto-calculate (optional)
            </p>
          )}
          {filteredProducts.length === 0 ? (
            <div className="rounded-3xl bg-slate-900/10 border border-white/5 py-12 text-center text-slate-500 font-bold text-sm">
              No products found
            </div>
          ) : (
              filteredProducts.map((product) => {
              const selected = selectedProducts[product.id];
              const quantity = selected?.quantity || 0;
              const effectivePrice = getEffectivePrice(product);
              const isCustomPrice = customerPrices[product.id] !== undefined;
              const itemTotal = effectivePrice * quantity;

              return (
                <div
                  key={product.id}
                  className="card rounded-2xl p-4.5 flex items-center justify-between hover:card-hover hover:scale-[1.005] transition-all duration-200 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-[var(--text-primary)] transition-colors duration-200 truncate">{product.name}</p>
                      {isCustomPrice && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--primary)] bg-[var(--primary-light)] px-1.5 py-0.5 rounded border border-[var(--primary)]/20 shrink-0">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--text-secondary)] text-xs mt-1.5 font-medium">
                      ₹{new Intl.NumberFormat("en-IN").format(effectivePrice)} × {quantity} = <span className="text-emerald-400 font-bold">₹{new Intl.NumberFormat("en-IN").format(itemTotal)}</span>
                      {isCustomPrice && (
                        <span className="text-[var(--text-muted)] ml-1.5 line-through text-[10px]">₹{new Intl.NumberFormat("en-IN").format(product.sale_price)}</span>
                      )}
                    </p>
                    <p className="text-[var(--text-secondary)] text-[10px] uppercase font-bold tracking-wider mt-1">
                      {product.stock_quantity} {product.unit} available
                    </p>
                  </div>

                  {/* Quantity Selector */}
                  <div className="flex items-center gap-3.5 ml-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(product, quantity - 1)}
                      className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-black text-lg hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer outline-none border border-rose-500/10 flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-black text-[var(--text-primary)] text-base">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(product, quantity + 1)}
                      className="w-10 h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-black text-lg hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer outline-none border border-emerald-500/10 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message */}
        {message && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl font-bold text-xs">
            {message}
          </div>
        )}

        {/* Save Button */}
        <form onSubmit={handleSave} className="pt-2">
          <button
            type="submit"
            disabled={saving || finalAmount <= 0}
            className={`w-full py-4.5 rounded-2xl font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 text-xs outline-none cursor-pointer shadow-lg disabled:opacity-50 disabled:pointer-events-none ${
              type === 'got' 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/5' 
                : 'bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white shadow-rose-500/5'
            }`}
          >
            {saving ? "Saving Transaction..." : `Save Transaction (₹${formattedAmount})`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TransactionEntry;
