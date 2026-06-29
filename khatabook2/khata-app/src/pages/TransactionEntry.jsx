import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import { requirePermission } from "../lib/permissions";
import { getSavedTemplate, fillTemplate } from "../lib/reminderTemplate";

function TransactionEntry() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const type = location.state?.type === "got" ? "got" : "gave";
  const isGot = type === "got";

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [customerPrices, setCustomerPrices] = useState({});
  const [paymentMode, setPaymentMode] = useState("cash");
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const getEffectivePrice = (product) => {
    return customerPrices[product.id] ?? product.sale_price;
  };

  // Load customer and (for "gave") products and customer-specific prices
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const promises = [
        supabase.from("customers").select("name, phone, auto_sms_enabled").eq("id", id).single(),
      ];

      // Only load products and prices for "gave" transactions
      if (!isGot) {
        promises.push(
          supabase.from("products").select("*").order("name"),
          supabase.from("customer_product_prices").select("product_id, custom_price").eq("customer_id", id),
        );
      }

      const [custRes, prodRes, priceRes] = await Promise.all(promises);

      if (!custRes.error) setCustomer(custRes.data);
      if (!isGot) {
        if (!prodRes.error) setProducts(prodRes.data || []);
        if (!priceRes.error && priceRes.data) {
          const priceMap = {};
          priceRes.data.forEach((p) => { priceMap[p.product_id] = p.custom_price; });
          setCustomerPrices(priceMap);
        }
      }
      setLoading(false);
    };

    loadData();
  }, [id, isGot]);

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
    if (newQuantity < 0) return;

    setMessage("");

    if (newQuantity === 0) {
      const updated = { ...selectedProducts };
      delete updated[product.id];
      setSelectedProducts(updated);
    } else {
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
    if (!requirePermission("add_transaction")) return;
    setMessage("");

    if (finalAmount <= 0) {
      setMessage(isGot ? "Please enter an amount." : "Please enter an amount or select products.");
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser();
      const created_by = user?.data?.user?.id || localStorage.getItem("khata_user") || "admin";

      // 1. Create main transaction
      const txnPayload = {
        customer_id: Number(id),
        type,
        amount: finalAmount,
        created_by,
      };

      // Include payment_mode for "got" transactions
      if (isGot) {
        txnPayload.payment_mode = paymentMode;
      }

      // Combine selected date with current time
      const now = new Date();
      const dateObj = new Date(selectedDate + "T00:00:00");
      dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      txnPayload.created_at = dateObj.toISOString();

      const { data: txn, error: txnError } = await offlineSupabase
        .from("transactions")
        .insert([txnPayload])
        .select()
        .single();

      if (txnError) throw txnError;

      // 2. For "gave" transactions: create transaction items and reduce stock
      if (!isGot && Object.keys(selectedProducts).length > 0) {
        const items = Object.values(selectedProducts).map((item) => ({
          transaction_id: txn.id,
          product_id: item.product.id,
          quantity: item.quantity,
          price: getEffectivePrice(item.product),
        }));

        const { error: itemsError } = await offlineSupabase.from("transaction_items").insert(items);
        if (itemsError) throw itemsError;

        for (const item of Object.values(selectedProducts)) {
          const newStock = item.product.stock_quantity - item.quantity;
          const { error: updateError } = await offlineSupabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product.id);

          if (updateError) throw updateError;
        }
      }

      // 3. Auto SMS if enabled
      if (customer?.auto_sms_enabled && customer?.phone) {
        try {
          const { data: allTxns } = await offlineSupabase
            .from("transactions")
            .select("type, amount")
            .eq("customer_id", id);
          let gave = 0, got = 0;
          (allTxns || []).forEach((t) => {
            if (t.type === "gave") gave += Number(t.amount);
            else got += Number(t.amount);
          });
          const balance = gave - got;
          const balanceLabel = balance >= 0 ? "You Will Get" : "You Will Give";

          const template = getSavedTemplate();
          const text = fillTemplate(template, {
            customerName: customer.name,
            balance: Math.abs(balance),
            balanceType: balanceLabel,
            ledgerLink: `${window.location.origin}/share/customer/${id}`,
            businessName: localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy",
          });
          const phone = customer.phone.replace(/[^0-9]/g, "");
          if (phone) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const url = isIOS
              ? `sms:${phone}&body=${encodeURIComponent(text)}`
              : `sms:${phone}?body=${encodeURIComponent(text)}`;
            const smsWindow = window.open(url, "_blank", "noopener,noreferrer");
            if (!smsWindow) window.location.href = url;
          }
        } catch {
          setMessage("Transaction saved. SMS could not be sent.");
        }
      }

      navigate(`/customer/${id}/transaction/success`, {
        state: {
          amount: finalAmount,
          type,
          itemCount: isGot ? 0 : Object.values(selectedProducts).length,
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

  const headerLabel = isGot
    ? `You got ₹${formattedAmount} from ${customer?.name || "customer"}`
    : `You gave ₹${formattedAmount} to ${customer?.name || "customer"}`;

  const headerClass = isGot ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-4 relative select-none animate-fade-in">
      <div className="max-w-3xl mx-auto space-y-4 relative z-10">
        {/* Header */}
        <div className="space-y-2">
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
            {isGot ? "You Got" : "You Gave"}
          </p>
          <h1 className={`text-xl font-black ${headerClass}`}>{headerLabel}</h1>
        </div>

        {/* Amount Display - Editable */}
        <div className="card rounded-3xl p-4 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Transaction Amount</p>
            {isGot && (
              <button
                type="button"
                onClick={() => setPaymentMode(paymentMode === "cash" ? "online" : "cash")}
                className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all duration-200 cursor-pointer outline-none active:scale-95 border ${
                  paymentMode === "cash"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                }`}
              >
                {paymentMode === "cash" ? "CASH" : "ONLINE"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 flex-1 relative z-10 min-w-0">
              <span className="text-2xl font-black text-[var(--text-secondary)] shrink-0">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder={calculatedAmount > 0 ? String(calculatedAmount) : "0"}
                className="text-4xl font-black bg-transparent border-none text-[var(--text-primary)] focus:outline-none w-full min-w-0 placeholder-[var(--text-muted)]"
              />
            </div>

          </div>
          <p className="text-[var(--text-secondary)] text-xs font-semibold mt-1.5 pl-1">
            {isGot
              ? "Enter the payment amount received"
              : manualAmount
              ? `Manual entry: ₹${formattedAmount}`
              : calculatedAmount > 0
              ? `From product total: ₹${formattedAmount}`
              : "Type manual amount or select products from catalogue below"}
          </p>
        </div>

        {/* Date Selector */}
        <div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              const input = document.getElementById("txn-date-input");
              if (input?.showPicker) input.showPicker();
              else input?.click();
            }}
            className="w-full flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 cursor-pointer hover:border-[var(--primary)] transition-all duration-200 text-left"
          >
            <svg className="w-4 h-4 text-[var(--text-secondary)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <svg className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <input
            id="txn-date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="hidden"
          />
        </div>

        {/* Save Button (only for "gave" — sticky while scrolling products) */}
        {!isGot && (
          <div className="sticky top-0 z-50 bg-[var(--background)] py-3 -mx-4 px-4">
            <button
              onClick={handleSave}
              disabled={saving || finalAmount <= 0}
              className="w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 text-xs outline-none cursor-pointer shadow-lg disabled:opacity-50 disabled:pointer-events-none bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white shadow-rose-500/5"
            >
              {saving ? "Saving..." : `Save (₹${formattedAmount})`}
            </button>
          </div>
        )}

        {/* Save Button (only for "got") */}
        {isGot && (
          <form onSubmit={handleSave}>
            <button
              type="submit"
              disabled={saving || finalAmount <= 0}
              className="w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 text-xs outline-none cursor-pointer shadow-lg disabled:opacity-50 disabled:pointer-events-none bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/5"
            >
              {saving ? "Saving Transaction..." : `Save Transaction (₹${formattedAmount})`}
            </button>
          </form>
        )}

        {/* Product Catalogue (only for "gave" transactions) */}
        {!isGot && (
          <>
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

            {/* Product List */}
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
                        <p className={`text-[10px] uppercase font-bold tracking-wider mt-1 ${
                          Number(product.stock_quantity) <= 0
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--text-secondary)]'
                        }`}>
                          Stock: {product.stock_quantity} {product.unit}
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
          </>
        )}

        {/* Message */}
        {message && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl font-bold text-xs">
            {message}
          </div>
        )}

      </div>
    </div>
  );
}

export default TransactionEntry;
