import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOfflineFirst } from "../lib/offline/offlineSupabase";

// Timezone-safe local date string helper
const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Date formatter helper (timezone agnostic)
const getFormattedDate = (dateStr) => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function CataloguePreview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [isTransposed, setIsTransposed] = useState(false);
  const [data, setData] = useState({
    customers: [],
    products: [],
    transactions: [],
    transactionItems: [],
  });

  // Fetch all required data once on mount
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        const [custRes, prodRes, txnRes, itemRes] = await Promise.all([
          useOfflineFirst("customers").getAll(),
          useOfflineFirst("products").getAll(),
          useOfflineFirst("transactions").getAll(),
          useOfflineFirst("transaction_items").getAll(),
        ]);
        setData({
          customers: custRes.data || [],
          products: prodRes.data || [],
          transactions: txnRes.data || [],
          transactionItems: itemRes.data || [],
        });
      } catch (e) {
        console.error("Error loading matrix data:", e);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, []);

  // Map customer lookups by ID and local_uuid
  const customerMap = useMemo(() => {
    const map = {};
    data.customers.forEach((c) => {
      if (c.id) map[c.id] = c;
      if (c.local_uuid) map[c.local_uuid] = c;
    });
    return map;
  }, [data.customers]);

  // Map product lookups by ID and local_uuid
  const productMap = useMemo(() => {
    const map = {};
    data.products.forEach((p) => {
      if (p.id) map[p.id] = p;
      if (p.local_uuid) map[p.local_uuid] = p;
    });
    return map;
  }, [data.products]);

  // Filter transactions for the selected date
  const filteredTxns = useMemo(() => {
    return data.transactions.filter((t) => {
      const txnDate = t.created_at?.split("T")[0] || t.date;
      return txnDate === selectedDate;
    });
  }, [data.transactions, selectedDate]);

  // Map transactions on this date for fast item lookup
  const filteredTxnsMap = useMemo(() => {
    const map = {};
    filteredTxns.forEach((t) => {
      if (t.id) map[t.id] = t;
      if (t.local_uuid) map[t.local_uuid] = t;
    });
    return map;
  }, [filteredTxns]);

  // Filter items belonging to transactions of the selected period
  const dateItems = useMemo(() => {
    return data.transactionItems.filter((item) => {
      return filteredTxnsMap[item.transaction_id] !== undefined;
    });
  }, [data.transactionItems, filteredTxnsMap]);

  // Build the distribution matrix & identify active customers/products
  const matrixData = useMemo(() => {
    // grid[customerKey][productKey] = quantity sum
    const grid = {};
    const activeCustKeys = new Set();
    const activeProdKeys = new Set();

    dateItems.forEach((item) => {
      const txn = filteredTxnsMap[item.transaction_id];
      if (!txn) return;
      const cust = customerMap[txn.customer_id];
      if (!cust) return;
      const prod = productMap[item.product_id];
      if (!prod) return;

      const custKey = cust.id || cust.local_uuid;
      const prodKey = prod.id || prod.local_uuid;

      activeCustKeys.add(custKey);
      activeProdKeys.add(prodKey);

      if (!grid[custKey]) grid[custKey] = {};
      grid[custKey][prodKey] = (grid[custKey][prodKey] || 0) + Number(item.quantity);
    });

    // Extract and sort active customers alphabetically
    const activeCustomers = data.customers
      .filter((c) => activeCustKeys.has(c.id || c.local_uuid))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // Extract and sort active products alphabetically
    const activeProducts = data.products
      .filter((p) => activeProdKeys.has(p.id || p.local_uuid))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return {
      grid,
      customers: activeCustomers,
      products: activeProducts,
    };
  }, [dateItems, filteredTxnsMap, customerMap, productMap, data.customers, data.products]);

  // Calculate totals
  const totals = useMemo(() => {
    const { grid, customers, products } = matrixData;
    const rowTotals = {}; // If not transposed: customerKey -> total. If transposed: productKey -> total
    const colTotals = {}; // If not transposed: productKey -> total. If transposed: customerKey -> total
    let grandTotal = 0;

    if (!isTransposed) {
      customers.forEach((c) => {
        const custKey = c.id || c.local_uuid;
        let cTotal = 0;
        products.forEach((p) => {
          const prodKey = p.id || p.local_uuid;
          const qty = grid[custKey]?.[prodKey] || 0;
          cTotal += qty;
          colTotals[prodKey] = (colTotals[prodKey] || 0) + qty;
        });
        rowTotals[custKey] = cTotal;
        grandTotal += cTotal;
      });
    } else {
      products.forEach((p) => {
        const prodKey = p.id || p.local_uuid;
        let pTotal = 0;
        customers.forEach((c) => {
          const custKey = c.id || c.local_uuid;
          const qty = grid[custKey]?.[prodKey] || 0;
          pTotal += qty;
          colTotals[custKey] = (colTotals[custKey] || 0) + qty;
        });
        rowTotals[prodKey] = pTotal;
        grandTotal += pTotal;
      });
    }

    return { rowTotals, colTotals, grandTotal };
  }, [matrixData, isTransposed]);

  const isEmpty = matrixData.customers.length === 0 || matrixData.products.length === 0;

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col overflow-hidden select-none animate-fade-in">
      <div className="w-full flex flex-col flex-1 min-h-0 px-3 md:px-4 pt-3 md:pt-4 pb-2 md:pb-3 gap-2 md:gap-3">
        
        {/* Header Section */}
        <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 shrink-0">
          <div className="space-y-0.5">
            <h1 className="text-sm md:text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Distribution Matrix
            </h1>
            <p className="text-[10px] md:text-xs text-[var(--text-secondary)] font-medium">
              {isEmpty
                ? "Select a date to view the sheet"
                : `Showing sheet for ${getFormattedDate(selectedDate)}`}
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95 shrink-0 shadow-sm"
          >
            <svg className="w-3 h-3 md:w-3.5 md:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        {/* Toolbar: Date picker + Transpose button */}
        <div className="flex items-center justify-end gap-2.5 bg-[var(--surface)] border border-[var(--border)] p-2 md:p-3 rounded-xl shadow-sm shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950/40 border border-white/8 hover:border-white/12 rounded-lg px-2.5 py-1 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition text-xs cursor-pointer"
            />
          </div>

          <button
            onClick={() => setIsTransposed(!isTransposed)}
            className="flex items-center gap-1 bg-transparent hover:bg-[var(--border)] border border-[var(--border)] px-2.5 py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95 shrink-0 shadow-sm"
          >
            <span>🔄</span>
            <span className="hidden xs:inline">Transpose</span>
          </button>
        </div>

        {/* Matrix Container */}
        {loading ? (
          <div className="card rounded-2xl flex-1 flex items-center justify-center text-[var(--text-secondary)] font-bold animate-pulse uppercase tracking-widest text-xs md:text-sm">
            Loading Matrix Data...
          </div>
        ) : isEmpty ? (
          <div className="card border-dashed rounded-2xl flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)]">
            <span className="text-3xl block mb-3">📦</span>
            <p className="font-bold uppercase tracking-widest text-xs md:text-sm text-[var(--text-primary)]">No Product Distributions</p>
            <p className="text-[10px] md:text-xs text-[var(--text-muted)] mt-1.5 font-medium">
              No product transactions found for the selected period.
            </p>
          </div>
        ) : (
          <div className="card rounded-2xl flex-1 min-h-0 flex flex-col p-0 overflow-hidden shadow-sm">
            <div className="flex-1 min-h-0 overflow-auto border border-[var(--border)] rounded-2xl">
              <table className="min-w-full text-xs md:text-sm border-collapse">
                <thead>
                  <tr className="bg-[var(--primary-light)] sticky top-0 z-30">
                    {/* Top-Left Corner Header (Sticky left + top) */}
                    <th className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-left whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky left-0 top-0 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      {isTransposed ? "Product" : "Customer"}
                    </th>
                    {/* Column Headers */}
                    {!isTransposed
                      ? matrixData.products.map((p) => {
                          const prodKey = p.id || p.local_uuid;
                          return (
                            <th
                              key={prodKey}
                              className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20"
                            >
                              {p.name}
                            </th>
                          );
                        })
                      : matrixData.customers.map((c) => {
                          const custKey = c.id || c.local_uuid;
                          return (
                            <th
                              key={custKey}
                              className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20"
                            >
                              {c.name}
                            </th>
                          );
                        })}
                    {/* Row Totals Header */}
                    <th className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!isTransposed
                    ? matrixData.customers.map((c) => {
                        const custKey = c.id || c.local_uuid;
                        return (
                          <tr key={custKey} className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                            {/* Sticky Left Customer Header cell */}
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                              {c.name}
                            </td>
                            {/* Product cells */}
                            {matrixData.products.map((p) => {
                              const prodKey = p.id || p.local_uuid;
                              const qty = matrixData.grid[custKey]?.[prodKey] || 0;
                              return (
                                <td
                                  key={prodKey}
                                  className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)]"
                                >
                                  {qty}
                                </td>
                              );
                            })}
                            {/* Row Total cell */}
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] whitespace-nowrap">
                              {totals.rowTotals[custKey] || 0}
                            </td>
                          </tr>
                        );
                      })
                    : matrixData.products.map((p) => {
                        const prodKey = p.id || p.local_uuid;
                        return (
                          <tr key={prodKey} className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                            {/* Sticky Left Product Header cell */}
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                              {p.name}
                            </td>
                            {/* Customer cells */}
                            {matrixData.customers.map((c) => {
                              const custKey = c.id || c.local_uuid;
                              const qty = matrixData.grid[custKey]?.[prodKey] || 0;
                              return (
                                <td
                                  key={custKey}
                                  className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)]"
                                >
                                  {qty}
                                </td>
                              );
                            })}
                            {/* Row Total cell */}
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] whitespace-nowrap">
                              {totals.rowTotals[prodKey] || 0}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--primary-light)] sticky bottom-0 z-30">
                    {/* Sticky Left Bottom "TOTAL" cell */}
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky left-0 bottom-0 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                      TOTAL
                    </td>
                    {/* Column Totals cells */}
                    {!isTransposed
                      ? matrixData.products.map((p) => {
                          const prodKey = p.id || p.local_uuid;
                          return (
                            <td
                              key={prodKey}
                              className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap"
                            >
                              {totals.colTotals[prodKey] || 0}
                            </td>
                          );
                        })
                      : matrixData.customers.map((c) => {
                          const custKey = c.id || c.local_uuid;
                          return (
                            <td
                              key={custKey}
                              className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap"
                            >
                              {totals.colTotals[custKey] || 0}
                            </td>
                          );
                        })}
                    {/* Grand Total cell */}
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-black text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap">
                      {totals.grandTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}

export default CataloguePreview;
