import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import ReportTabs from "../components/ReportTabs";

function getDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatINR(value) {
  return new Intl.NumberFormat("en-IN").format(Math.round(Number(value) || 0));
}

function formatProfitPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}%`;
}

function ProfitReport() {
  const navigate = useNavigate();
  const today = useMemo(() => getDateStr(new Date()), []);
  const [transactions, setTransactions] = useState([]);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [showDurationModal, setShowDurationModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [txnRes, itemRes, productRes] = await Promise.all([
      supabase.from("transactions").select("id, type, created_at, date").order("created_at", { ascending: false }),
      supabase.from("transaction_items").select("*"),
      supabase.from("products").select("id, name, sale_price, purchase_price, unit"),
    ]);
    if (!txnRes.error) setTransactions(txnRes.data || []);
    if (!itemRes.error) setItems(itemRes.data || []);
    if (!productRes.error) setProducts(productRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("profit-report-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_items" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  const productMap = useMemo(() => {
    const map = {};
    products.forEach((product) => { map[String(product.id)] = product; });
    return map;
  }, [products]);

  const soldTransactionIds = useMemo(() => {
    return new Set(transactions
      .filter((transaction) => {
        if (transaction.type !== "gave") return false;
        const txnDate = transaction.created_at?.split("T")[0] || transaction.date;
        return (!startDate || txnDate >= startDate) && (!endDate || txnDate <= endDate);
      })
      .map((transaction) => String(transaction.id)));
  }, [transactions, startDate, endDate]);

  const productBreakdown = useMemo(() => {
    const totals = new Map();

    items.forEach((item) => {
      if (!soldTransactionIds.has(String(item.transaction_id))) return;
      const productId = String(item.product_id);
      const product = productMap[productId];
      if (!product) return;

      const quantity = Number(item.quantity) || 0;
      const sellingPrice = Number(item.price ?? product.sale_price) || 0;
      const purchasePrice = Number(product.purchase_price) || 0;
      const revenue = sellingPrice * quantity;
      const profit = (sellingPrice - purchasePrice) * quantity;
      const existing = totals.get(productId) || {
        id: item.product_id,
        name: product.name || "Product",
        unit: product.unit || "",
        quantity: 0,
        revenue: 0,
        profit: 0,
      };

      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.profit += profit;
      totals.set(productId, existing);
    });

    return Array.from(totals.values()).sort((a, b) => b.profit - a.profit);
  }, [items, productMap, soldTransactionIds]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return productBreakdown;
    return productBreakdown.filter((product) => product.name.toLowerCase().includes(term));
  }, [productBreakdown, searchTerm]);

  const summary = useMemo(() => {
    const totalProfit = productBreakdown.reduce((sum, product) => sum + product.profit, 0);
    const totalRevenue = productBreakdown.reduce((sum, product) => sum + product.revenue, 0);
    const profitPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalProfit, totalRevenue, profitPercent };
  }, [productBreakdown]);

  const handleDurationSelect = (key) => {
    const now = new Date();
    if (key === "today") {
      const date = getDateStr(now);
      setStartDate(date);
      setEndDate(date);
    } else if (key === "this_week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(getDateStr(start));
      setEndDate(getDateStr(now));
    } else if (key === "this_month") {
      setStartDate(getDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(getDateStr(now));
    }
    setShowDurationModal(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto p-6 space-y-5 animate-fade-in">
        <button
          onClick={() => navigate("/admin/home")}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Home
        </button>

        <ReportTabs active="profit" />

        <div className="grid grid-cols-2 gap-3">
          <div className="card rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Total Profit</p>
            <p className="text-2xl font-black mt-1 text-[#52b788]">₹{formatINR(summary.totalProfit)}</p>
          </div>
          <div className="card rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Profit %</p>
            <p className="text-2xl font-black mt-1 text-[#52b788]">{formatProfitPercent(summary.profitPercent)}</p>
          </div>
        </div>

        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-11 pr-5 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
            placeholder="Search Products"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Start Date</p>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">End Date</p>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition"
            />
          </div>
          <button
            onClick={() => setShowDurationModal(true)}
            className="self-end px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--surface)] transition cursor-pointer outline-none flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            Filter
          </button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl card py-12 text-center text-[var(--text-secondary)]">
              <p className="font-bold text-sm">No product sales found.</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <div key={product.id} className="card rounded-2xl p-4 shadow-sm hover:card-hover transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-black text-[var(--text-primary)] truncate">{product.name}</h2>
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1">
                      Qty Sold
                    </p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {product.quantity} {product.unit}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-right shrink-0">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Revenue</p>
                      <p className="text-sm font-black text-[var(--text-primary)]">₹{formatINR(product.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Profit</p>
                      <p className="text-sm font-black text-[#52b788]">₹{formatINR(product.profit)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showDurationModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowDurationModal(false)}
        >
          <div className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Filter by Duration</h2>
            <div className="space-y-2">
              {[
                { key: "today", label: "Today" },
                { key: "this_week", label: "This Week" },
                { key: "this_month", label: "This Month" },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleDurationSelect(option.key)}
                  className="w-full block p-3.5 rounded-2xl border-2 border-[var(--border)] hover:border-[var(--border-hover)] text-left cursor-pointer transition-all duration-200"
                >
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfitReport;
