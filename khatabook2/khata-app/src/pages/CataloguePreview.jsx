import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOfflineFirst, offlineSupabase } from "../lib/offline/offlineSupabase";
import {
  sortCustomersByMatrix,
  moveCustomerToMatrixPosition,
  persistMatrixOrder,
} from "../utils/customerOrdering";
import { localDateKey } from "../lib/dateKey";
import { normalizeProductName } from "../lib/excelImport";

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

function PositionModal({ customer, total, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = parseInt(value, 10);
    if (!num || num < 1 || num > total) return;
    setSaving(true);
    await onSave(customer.id, num);
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)] mb-1">
          Move {customer.name}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Currently at position #{customer.position}. Enter new position (1–{total}).
        </p>
        <input
          type="number"
          min="1"
          max={total}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300"
          placeholder={`1 – ${total}`}
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="flex-1 bg-[var(--primary)] hover:opacity-90 text-white font-black py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeLookupKey(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function CataloguePreview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [isTransposed, setIsTransposed] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderCustomers, setOrderCustomers] = useState([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const [modalCustomer, setModalCustomer] = useState(null);
  const [data, setData] = useState({
    customers: [],
    products: [],
    transactions: [],
    transactionItems: [],
    productTransactions: [],
  });

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        const [custRes, prodRes, txnRes, itemRes, ptRes] = await Promise.all([
          useOfflineFirst("customers").getAll(),
          useOfflineFirst("products").getAll(),
          useOfflineFirst("transactions").getAll(),
          useOfflineFirst("transaction_items").getAll(),
          useOfflineFirst("product_transactions").getAll(),
        ]);
        setData({
          customers: custRes.data || [],
          products: prodRes.data || [],
          transactions: txnRes.data || [],
          transactionItems: itemRes.data || [],
          productTransactions: ptRes.data || [],
        });
      } catch (e) {
        console.error("Error loading matrix data:", e);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, []);

  const openOrderModal = async () => {
    const { data } = await offlineSupabase
      .from("customers")
      .select("id, name, matrix_position")
      .order("matrix_position", { ascending: true, nullsFirst: false });
    if (data) setOrderCustomers(sortCustomersByMatrix(data));
    setShowOrderModal(true);
  };

  const handleOrderSave = async (customerId, newPosition) => {
    setOrderSaving(true);
    try {
      const reordered = moveCustomerToMatrixPosition(orderCustomers, customerId, newPosition);
      setOrderCustomers(reordered);
      await persistMatrixOrder(offlineSupabase, reordered);
    } catch (err) {
      console.error("Failed to save position", err);
    }
    setOrderSaving(false);
  };

  const customerMap = useMemo(() => {
    const map = new Map();
    data.customers.forEach((c) => {
      const normalizedId = normalizeLookupKey(c.id);
      const normalizedLocalUuid = normalizeLookupKey(c.local_uuid);
      if (normalizedId) map.set(normalizedId, c);
      if (normalizedLocalUuid) map.set(normalizedLocalUuid, c);
    });
    return map;
  }, [data.customers]);

  const productMap = useMemo(() => {
    const map = new Map();
    data.products.forEach((p) => {
      const normalizedId = normalizeLookupKey(p.id);
      const normalizedLocalUuid = normalizeLookupKey(p.local_uuid);
      if (normalizedId) map.set(normalizedId, p);
      if (normalizedLocalUuid) map.set(normalizedLocalUuid, p);
    });
    return map;
  }, [data.products]);

  const filteredTxns = useMemo(() => {
    return data.transactions.filter((t) => {
      const txnDate = localDateKey(t.created_at || t.date);
      return txnDate === selectedDate;
    });
  }, [data.transactions, selectedDate]);

  const filteredTxnsMap = useMemo(() => {
    const map = new Map();
    filteredTxns.forEach((t) => {
      const normalizedId = normalizeLookupKey(t.id);
      const normalizedLocalUuid = normalizeLookupKey(t.local_uuid);
      if (normalizedId) map.set(normalizedId, t);
      if (normalizedLocalUuid) map.set(normalizedLocalUuid, t);
    });
    return map;
  }, [filteredTxns]);

  const dateItems = useMemo(() => {
    return data.transactionItems.filter((item) => {
      const itemTxnId = normalizeLookupKey(item.transaction_id);
      if (!itemTxnId) return false;
      return filteredTxnsMap.has(itemTxnId);
    });
  }, [data.transactionItems, filteredTxnsMap]);

  const matrixData = useMemo(() => {
    const grid = {};
    dateItems.forEach((item) => {
      const txn = filteredTxnsMap.get(normalizeLookupKey(item.transaction_id));
      if (!txn) return;
      const custKey = normalizeLookupKey(txn.customer_id);
      const cust = customerMap.get(custKey);
      if (!cust) return;
      const prodKey = normalizeLookupKey(item.product_id);
      const prod = productMap.get(prodKey);
      if (!prod) return;
      const rowCustomerKey = normalizeLookupKey(cust.id) || normalizeLookupKey(cust.local_uuid);
      const columnProductKey = normalizeLookupKey(prod.id) || normalizeLookupKey(prod.local_uuid);
      if (!grid[rowCustomerKey]) grid[rowCustomerKey] = {};
      grid[rowCustomerKey][columnProductKey] = (grid[rowCustomerKey][columnProductKey] || 0) + Number(item.quantity);
    });
    const allCustomers = sortCustomersByMatrix(data.customers);
    const allProducts = [...data.products].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { grid, customers: allCustomers, products: allProducts };
  }, [dateItems, filteredTxnsMap, customerMap, productMap, data.customers, data.products]);

  const totals = useMemo(() => {
    const { grid, customers, products } = matrixData;
    const rowTotals = {};
    const colTotals = {};
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

  const stockInByProduct = useMemo(() => {
    const map = {};
    data.productTransactions.forEach((pt) => {
      if (pt.type !== "stock_in") return;
      const txnDate = localDateKey(pt.created_at);
      if (txnDate !== selectedDate) return;
      const prodKey = normalizeLookupKey(pt.product_id);
      if (!prodKey) return;
      map[prodKey] = (map[prodKey] || 0) + Number(pt.quantity || 0);
    });
    return map;
  }, [data.productTransactions, selectedDate]);

  // ── Excel Stock In Import ─────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [excelImport, setExcelImport] = useState({
    isOpen: false,
    file: null,
    preview: [],
    importErrors: [],
    confirmed: false,
    saving: false,
  });

  const openExcelImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const closeExcelImport = useCallback(() => {
    setExcelImport({ isOpen: false, file: null, preview: [], importErrors: [], confirmed: false, saving: false });
  }, []);

  const getProductPurchasePrice = useCallback((productId) => {
    const product = data.products.find((p) => p.id === productId || p.local_uuid === productId);
    return product ? Number(product.purchase_price) : 0;
  }, [data.products]);

  const doExcelStockInImport = useCallback(async (items, fileName) => {
    if (items.length === 0) return;

    const offline = offlineSupabase;
    const userResult = await offline.auth.getUser();
    const created_by = userResult?.data?.user?.id || localStorage.getItem("khata_user") || "admin";

    const transactionsToInsert = items.map((item) => ({
      product_id: item.productId,
      type: "stock_in",
      quantity: item.totalStockIn,
      price: getProductPurchasePrice(item.productId),
      notes: "Excel Stock In Import",
      created_by,
    }));

    const { error: txError } = await offline.from("product_transactions").insert(transactionsToInsert);
    if (txError) throw txError;

    for (const item of items) {
      const { data: prod, error: fetchErr } = await offline
        .from("products")
        .select("stock_quantity")
        .eq("id", item.productId)
        .single();
      if (fetchErr) throw fetchErr;

      const newStock = Number(prod.stock_quantity) + item.totalStockIn;
      const { error: stockErr } = await offline.from("products").update({
        stock_quantity: newStock,
        updated_at: new Date().toISOString(),
      }).eq("id", item.productId);
      if (stockErr) throw stockErr;
    }

    const { error: historyError } = await offline.from("import_history").insert([{
      filename: fileName || "Stock In Excel Import",
      uploader: created_by,
      file_hash: "stock-in-excel",
      sheet_name: "Stock In",
      parsed_preview: items.map((item) => ({
        productName: item.productName,
        qty: item.qty,
        inven: item.inven,
        totalStockIn: item.totalStockIn,
      })),
      import_statistics: {
        productsImported: items.length,
        totalStockIn: items.reduce((sum, item) => sum + item.totalStockIn, 0),
        transactionsCreated: items.length,
      },
      validation_report: {},
      status: "imported",
    }]);
    if (historyError) throw historyError;
  }, [getProductPurchasePrice]);

  const confirmExcelImport = useCallback(async () => {
    if (!excelImport.preview || excelImport.preview.length === 0) return;
    setExcelImport((prev) => ({ ...prev, saving: true }));
    try {
      await doExcelStockInImport(excelImport.preview, excelImport.file?.name);
      setExcelImport((prev) => ({ ...prev, saving: false, confirmed: true }));
      setTimeout(() => {
        closeExcelImport();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 1200);
    } catch (err) {
      setExcelImport((prev) => ({
        ...prev,
        saving: false,
        importErrors: [...(prev.importErrors || []), err.message || "Import failed"],
      }));
    }
  }, [excelImport.preview, excelImport.file, doExcelStockInImport, closeExcelImport]);

  const cancelExcelImport = useCallback(() => {
    closeExcelImport();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [closeExcelImport]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setExcelImport({ isOpen: true, file: null, preview: [], importErrors: ["Please upload an .xlsx or .xls file."], confirmed: false, saving: false });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const arrayBuffer = evt.target?.result;
      if (!arrayBuffer) return;

      let workbook, XLSX;
      try {
        XLSX = await import("xlsx");
        workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
      } catch {
        setExcelImport({ isOpen: true, file: null, preview: [], importErrors: ["The selected file is not a readable Excel workbook."], confirmed: false, saving: false });
        return;
      }

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setExcelImport({ isOpen: true, file: null, preview: [], importErrors: ["Header row missing."], confirmed: false, saving: false });
        return;
      }
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });

      if (!rawData || rawData.length === 0) {
        setExcelImport({ isOpen: true, file: null, preview: [], importErrors: ["The Excel file appears to be empty."], confirmed: false, saving: false });
        return;
      }

      let headerRowIndex = -1;
      for (let r = 0; r < Math.min(rawData.length, 10); r += 1) {
        const row = rawData[r];
        if (!row || row.length === 0) continue;
        const hasStockIn = row.some((c) => String(c ?? "").trim().toLowerCase().replace(/[^a-z ]/g, "").includes("stock in"));
        if (hasStockIn) { headerRowIndex = r; break; }
      }

      if (headerRowIndex === -1) {
        setExcelImport({ isOpen: true, file: null, preview: [], importErrors: ['Could not find a "STOCK IN" column header in the first 10 rows.'], confirmed: false, saving: false });
        return;
      }

      const headers = rawData[headerRowIndex];
      const normH = (h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9 .]/g, "");
      const stockInCol = headers.findIndex((h) => normH(h).includes("stock in"));
      const qtyCol = headers.findIndex((h) => normH(h) === "qty");
      const invenCol = headers.findIndex((h) => normH(h).replace(".", "") === "inven" || normH(h).includes("inven"));

      const errors = [];
      if (stockInCol === -1) errors.push('Could not find a "STOCK IN" column in the header row.');
      if (qtyCol === -1) errors.push('Could not find a "QTY" column in the header row.');
      if (invenCol === -1) errors.push('Could not find an "INVEN" or "INVEN." column in the header row.');
      if (errors.length > 0) {
        setExcelImport({ isOpen: true, file: null, preview: [], importErrors: errors, confirmed: false, saving: false });
        return;
      }

      const preview = [];
      const importErrors = [];

      for (let i = headerRowIndex + 1; i < rawData.length; i += 1) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;
        const maxCol = Math.max(stockInCol, qtyCol, invenCol);
        if (row.length <= maxCol && row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

        const rawStockIn = row[stockInCol];
        if (rawStockIn === null || rawStockIn === undefined) continue;
        const stockIn = String(rawStockIn).trim();
        if (!stockIn) continue;

        const productMatch = data.products.find(
          (p) => normalizeProductName(p.name) === normalizeProductName(stockIn),
        );
        if (!productMatch) {
          importErrors.push(`Product "${stockIn}" not found in catalogue`);
          continue;
        }

        let qty = 0;
        if (row[qtyCol] !== null && row[qtyCol] !== undefined) {
          qty = Number(String(row[qtyCol]).replace(/,/g, "").trim());
          if (isNaN(qty)) qty = 0;
        }

        let inven = 0;
        if (row[invenCol] !== null && row[invenCol] !== undefined) {
          inven = Number(String(row[invenCol]).replace(/,/g, "").trim());
          if (isNaN(inven)) inven = 0;
        }

        preview.push({
          productId: productMatch.id,
          productName: productMatch.name,
          productUnit: productMatch.unit || "LTR",
          qty,
          inven,
          totalStockIn: qty + inven,
        });
      }

      setExcelImport({
        isOpen: true,
        file,
        preview,
        importErrors: importErrors.length > 0 ? importErrors : undefined,
        confirmed: false,
        saving: false,
      });
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [data.products]);

  // ── Render ────────────────────────────────────────────────────────────
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

        {/* Toolbar */}
        <div className="flex items-center justify-end gap-2 bg-[var(--surface)] border border-[var(--border)] p-2 md:p-3 rounded-xl shadow-sm shrink-0 flex-wrap">
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

          <button
            onClick={openOrderModal}
            className="flex items-center gap-1 bg-transparent hover:bg-[var(--border)] border border-[var(--border)] px-2.5 py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95 shrink-0 shadow-sm"
          >
            <span>📋</span>
            <span className="hidden xs:inline">Order</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
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
                    <th className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-left whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky left-0 top-0 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      {isTransposed ? "Product" : "Customer"}
                    </th>
                    {!isTransposed
                      ? matrixData.products.map((p) => {
                          const prodKey = p.id || p.local_uuid;
                          return (
                            <th key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20">
                              {p.name}
                            </th>
                          );
                        })
                      : matrixData.customers.map((c) => {
                          const custKey = c.id || c.local_uuid;
                          return (
                            <th key={custKey} className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20">
                              {c.name}
                            </th>
                          );
                        })}
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
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                              {c.name}
                            </td>
                            {matrixData.products.map((p) => {
                              const prodKey = p.id || p.local_uuid;
                              const qty = matrixData.grid[custKey]?.[prodKey] || 0;
                              return (
                                <td key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)]">
                                  {qty || "-"}
                                </td>
                              );
                            })}
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
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                              {p.name}
                            </td>
                            {matrixData.customers.map((c) => {
                              const custKey = c.id || c.local_uuid;
                              const qty = matrixData.grid[custKey]?.[prodKey] || 0;
                              return (
                                <td key={custKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)]">
                                  {qty || "-"}
                                </td>
                              );
                            })}
                            <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] whitespace-nowrap">
                              {totals.rowTotals[prodKey] || 0}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--primary-light)] sticky bottom-0 z-30">
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky left-0 bottom-0 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                      TOTAL
                    </td>
                    {!isTransposed
                      ? matrixData.products.map((p) => {
                          const prodKey = p.id || p.local_uuid;
                          return (
                            <td key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap">
                              {totals.colTotals[prodKey] || 0}
                            </td>
                          );
                        })
                      : matrixData.customers.map((c) => {
                          const custKey = c.id || c.local_uuid;
                          return (
                            <td key={custKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap">
                              {totals.colTotals[custKey] || 0}
                            </td>
                          );
                        })}
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-black text-right text-[10px] md:text-sm bg-[var(--primary-light)] text-[var(--primary)] sticky bottom-0 z-20 whitespace-nowrap">
                      {totals.grandTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Second Matrix — Stock In / Stock Out / Difference */}
        {!loading && !isEmpty && (
          <div className="card rounded-2xl min-h-0 flex flex-col p-0 overflow-hidden shadow-sm shrink-0">
            <div className="px-3 py-2 md:px-4 md:py-3 border-b border-[var(--border)]">
              <h2 className="text-[10px] md:text-xs font-black uppercase tracking-wider text-[var(--primary)]">
                Stock Summary
              </h2>
            </div>
            <div className="overflow-auto border border-[var(--border)] rounded-2xl">
              <table className="min-w-full text-xs md:text-sm border-collapse">
                <thead>
                  <tr className="bg-[var(--primary-light)] sticky top-0 z-30">
                    <th className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-left whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky left-0 top-0 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      {isTransposed ? "Product" : "Product"}
                    </th>
                    {matrixData.products.map((p) => {
                      const prodKey = p.id || p.local_uuid;
                      return (
                        <th key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-r border-[var(--border)] text-right whitespace-nowrap bg-[var(--primary-light)] text-[var(--primary)] sticky top-0 z-20">
                          {p.name}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Stock In row */}
                  <tr className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                      Stock In
                    </td>
                    {matrixData.products.map((p) => {
                      const prodKey = p.id || p.local_uuid;
                      const val = stockInByProduct[prodKey] || 0;
                      return (
                        <td key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)] font-medium">
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Stock Out row */}
                  <tr className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                      Stock Out
                    </td>
                    {matrixData.products.map((p) => {
                      const prodKey = p.id || p.local_uuid;
                      const val = totals.colTotals[prodKey] || 0;
                      return (
                        <td key={prodKey} className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] text-[var(--text-primary)] font-medium">
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Difference row */}
                  <tr className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                    <td className="px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] font-bold text-[10px] md:text-sm bg-[var(--surface)] text-[var(--text-primary)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                      Difference
                    </td>
                    {matrixData.products.map((p) => {
                      const prodKey = p.id || p.local_uuid;
                      const stockIn = stockInByProduct[prodKey] || 0;
                      const stockOut = totals.colTotals[prodKey] || 0;
                      const diff = stockIn - stockOut;
                      return (
                        <td key={prodKey} className={`px-2.5 py-2 md:px-4 md:py-3 border-b border-r border-[var(--border)] text-right text-[10px] md:text-sm whitespace-nowrap bg-[var(--surface)] font-bold ${diff === 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {diff}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Order Modal */}
      {showOrderModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => { if (!orderSaving) setShowOrderModal(false); }}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] card rounded-t-3xl sm:rounded-3xl shadow-2xl animate-scale-in flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Customer Order
                  </h2>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                    Tap a customer to change position
                  </p>
                </div>
                {orderSaving && (
                  <span className="text-[10px] font-bold text-[var(--primary)] animate-pulse">Saving...</span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
              {orderCustomers.map((customer, index) => (
                <button
                  key={customer.id}
                  onClick={() => setModalCustomer({ ...customer, position: index + 1 })}
                  className="w-full card rounded-xl px-3.5 py-3 flex items-center gap-3 text-left cursor-pointer active:scale-[0.98] transition-all duration-150"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: "#ebf6f5", color: "#5cbdb9" }}>
                    {index + 1}
                  </div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: "#ebf6f5", color: "#5cbdb9" }}>
                    {(customer.name?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "#2d3436" }}>{customer.name}</p>
                    <p className="text-[10px] font-medium text-[var(--text-muted)]">Position #{index + 1}</p>
                  </div>
                  <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] shrink-0">
              <button
                onClick={() => setShowOrderModal(false)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCustomer && (
        <PositionModal
          customer={modalCustomer}
          total={orderCustomers.length}
          onClose={() => setModalCustomer(null)}
          onSave={handleOrderSave}
        />
      )}

      {/* Excel Stock In Import Preview Modal */}
      {excelImport.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => { if (!excelImport.saving && !excelImport.confirmed) cancelExcelImport(); }}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] card rounded-3xl p-6 shadow-2xl animate-scale-in flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)] mb-4 shrink-0">
              Stock In Import Preview
            </h2>

            {excelImport.importErrors && excelImport.importErrors.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl mb-4 shrink-0">
                <p className="text-[10px] font-black uppercase text-rose-500 mb-2">Import Errors:</p>
                <ul className="space-y-1 text-[var(--text-secondary)] text-xs max-h-32 overflow-auto">
                  {excelImport.importErrors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {excelImport.preview && excelImport.preview.length > 0 && !excelImport.confirmed && (
              <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto border border-[var(--border)] rounded-2xl">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--primary-light)] sticky top-0 z-10">
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-left">Product</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">QTY</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">INVEN.</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">TOTAL STOCK IN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelImport.preview.map((item, i) => (
                        <tr key={i} className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                          <td className="px-3 py-2 border-b border-[var(--border)] font-bold text-[var(--text-primary)]">{item.productName}</td>
                          <td className="px-3 py-2 border-b border-[var(--border)] text-right">{item.qty}</td>
                          <td className="px-3 py-2 border-b border-[var(--border)] text-right">{item.inven}</td>
                          <td className="px-3 py-2 border-b border-[var(--border)] font-bold text-[var(--primary)] text-right">+{item.totalStockIn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase text-[var(--text-secondary)]">
                    {excelImport.preview.length} products · Total: +{excelImport.preview.reduce((sum, item) => sum + item.totalStockIn, 0)} LTR
                  </p>
                </div>

                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={cancelExcelImport}
                    disabled={excelImport.saving}
                    className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmExcelImport}
                    disabled={excelImport.saving || excelImport.importErrors?.length > 0}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
                  >
                    {excelImport.saving ? "Importing..." : "Confirm Import"}
                  </button>
                </div>
              </div>
            )}

            {excelImport.preview && excelImport.preview.length === 0 && !excelImport.importErrors?.length && !excelImport.saving && (
              <p className="text-center text-[var(--text-secondary)] text-sm py-8">No products found to import.</p>
            )}

            {excelImport.confirmed && (
              <div className="text-center py-8">
                <p className="text-emerald-500 font-black text-lg">Import completed successfully</p>
                <p className="text-[var(--text-secondary)] text-xs mt-2">{excelImport.preview.length} products imported</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CataloguePreview;
