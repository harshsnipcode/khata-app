import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import ProductCard from "./ProductCard";
import SearchBar from "./SearchBar";
import ProductFilterModal from "./ProductFilterModal";
import { useNavigate } from "react-router-dom";
import { can } from "../lib/permissions";
import { normalizeProductName } from "../lib/excelImport";

function CatalogueView({ isAdmin }) {
  const canAddProduct = isAdmin || can("add_product");
  const canViewReport = isAdmin || can("view_reports");
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortType, setSortType] = useState("recent");
  const [showFilter, setShowFilter] = useState(false);
  const [pendingFilter, setPendingFilter] = useState("all");
  const [pendingSort, setPendingSort] = useState("recent");

  const fileInputRef = useRef(null);
  const [excelImport, setExcelImport] = useState({
    isOpen: false,
    file: null,
    preview: [],
    importErrors: [],
    confirmed: false,
    saving: false,
  });

  const loadProducts = async () => {
    setLoading(true);
    const [prodRes, groupRes] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("product_groups").select("id, name"),
    ]);
    if (!prodRes.error) setProducts(prodRes.data || []);
    if (!groupRes.error) setGroups(groupRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();

    const channel = supabase
      .channel("catalogue-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_groups" }, () => loadProducts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totals = useMemo(() => {
    let totalValue = 0;
    products.forEach((p) => {
      totalValue += Number(p.stock_quantity) * Number(p.sale_price);
    });
    return { totalValue };
  }, [products]);

  const groupMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => { map[g.id] = g.name; });
    return map;
  }, [groups]);

  const groupedProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortType === "recent") return new Date(b.created_at) - new Date(a.created_at);
      if (sortType === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortType === "highest") return Number(b.stock_quantity) - Number(a.stock_quantity);
      if (sortType === "lowest") return Number(a.stock_quantity) - Number(b.stock_quantity);
      if (sortType === "az") return a.name.localeCompare(b.name);
      return 0;
    });

    const groupOrder = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    const buckets = {};
    groupOrder.forEach((g) => { buckets[g.id] = []; });
    buckets["_ungrouped"] = [];

    list.forEach((p) => {
      if (p.group_id && buckets[p.group_id]) {
        buckets[p.group_id].push(p);
      } else {
        buckets["_ungrouped"].push(p);
      }
    });

    const result = [];
    groupOrder.forEach((g) => {
      if (buckets[g.id].length > 0) {
        result.push({ type: "header", groupId: g.id, name: g.name });
        buckets[g.id].forEach((p) => result.push({ type: "product", product: p }));
      }
    });
    if (buckets["_ungrouped"].length > 0) {
      result.push({ type: "header", groupId: "_ungrouped", name: "Ungrouped" });
      buckets["_ungrouped"].forEach((p) => result.push({ type: "product", product: p }));
    }

    return result;
  }, [products, groups, searchTerm, sortType]);

  const activeFilterCount = (filterType !== "all" ? 1 : 0) + (sortType !== "recent" ? 1 : 0);

  const applyFilter = () => {
    setFilterType(pendingFilter);
    setSortType(pendingSort);
    setShowFilter(false);
  };

  const openExcelImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const closeExcelImport = useCallback(() => {
    setExcelImport({ isOpen: false, file: null, preview: [], importErrors: [], confirmed: false, saving: false });
  }, []);

  const cancelExcelImport = useCallback(() => {
    closeExcelImport();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [closeExcelImport]);

  const doExcelStockInImport = useCallback(async (items, fileName) => {
    if (items.length === 0) return;
    const userResult = await supabase.auth.getUser();
    const created_by = userResult?.data?.user?.id || localStorage.getItem("khata_user") || "admin";

    const transactionsToInsert = items.map((item) => ({
      product_id: item.productId,
      type: "stock_in",
      quantity: item.totalStockIn,
      price: Number(item.purchasePrice || 0),
      notes: "Excel Stock In Import",
      created_by,
    }));

    const { error: txError } = await supabase.from("product_transactions").insert(transactionsToInsert);
    if (txError) throw txError;

    for (const item of items) {
      const { data: prod, error: fetchErr } = await supabase
        .from("products").select("stock_quantity").eq("id", item.productId).single();
      if (fetchErr) throw fetchErr;
      const newStock = Number(prod.stock_quantity) + item.totalStockIn;
      const { error: stockErr } = await supabase.from("products").update({
        stock_quantity: newStock,
        updated_at: new Date().toISOString(),
      }).eq("id", item.productId);
      if (stockErr) throw stockErr;
    }

    const { error: historyError } = await supabase.from("import_history").insert([{
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
  }, []);

  const confirmExcelImport = useCallback(async () => {
    if (!excelImport.preview || excelImport.preview.length === 0) return;
    setExcelImport((prev) => ({ ...prev, saving: true }));
    try {
      await doExcelStockInImport(excelImport.preview, excelImport.file?.name);
      setExcelImport((prev) => ({ ...prev, saving: false, confirmed: true }));
      loadProducts();
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

        const productMatch = products.find(
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
          purchasePrice: productMatch.purchase_price || 0,
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
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Catalogue Summary Card */}
      <div className="grid grid-cols-2 gap-4" style={{ containerType: "inline-size" }}>
        <div className="card rounded-3xl p-6 shadow-md">
          <p className="text-[var(--text-secondary)] text-xs uppercase tracking-widest mb-2 font-bold">Total Stock Value</p>
          <h2 className="text-[var(--text-primary)] font-black [font-size:clamp(0.875rem,7cqw,1.875rem)]">₹{new Intl.NumberFormat("en-IN").format(totals.totalValue)}</h2>
          {canViewReport && (
            <button onClick={() => navigate('/catalogue/reports')} className="mt-3 text-[var(--primary)] text-xs font-bold uppercase tracking-[0.2em] hover:text-[var(--primary-hover)] transition cursor-pointer">View Reports ›</button>
          )}
        </div>
        <div className="card rounded-3xl p-6 shadow-md">
          <p className="text-[var(--text-secondary)] text-xs uppercase tracking-widest mb-2 font-bold">Import Stock In</p>
          <h2 className="text-[var(--text-primary)] font-black [font-size:clamp(0.875rem,7cqw,1.875rem)]">📥 Excel</h2>
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={openExcelImport} className="text-[var(--primary)] text-xs font-bold uppercase tracking-[0.2em] hover:text-[var(--primary-hover)] transition cursor-pointer text-left">Import Now ›</button>
            <button onClick={() => navigate('/admin/stock-in-excel')} className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[var(--text-primary)] transition cursor-pointer text-left">View History ›</button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col gap-4">
        <div className="flex gap-4 items-center">
          <div className="bg-[var(--background)] rounded-2xl border border-[var(--border)] p-1 flex-1">
            <div className="py-2 text-sm font-bold bg-[var(--surface)] text-[var(--primary)] border border-[var(--border)] rounded-xl shadow-sm text-center">PRODUCTS</div>
          </div>
          {canAddProduct && (
            <button 
              onClick={() => navigate('/catalogue/add')}
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold px-6 py-3 rounded-2xl transition shadow-sm text-sm whitespace-nowrap cursor-pointer"
            >
              + ADD PRODUCT
            </button>
          )}
        </div>

        <SearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onOpenFilter={() => { setPendingFilter(filterType); setPendingSort(sortType); setShowFilter(true); }}
          activeCount={activeFilterCount}
          showPreview={true}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-[var(--text-secondary)] font-bold animate-pulse uppercase tracking-widest">Loading Catalogue...</div>
        ) : groupedProducts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-[var(--text-secondary)] card border-dashed rounded-3xl">
            <p className="font-bold uppercase tracking-widest">No Products Found</p>
            <p className="text-sm mt-1">Try a different search or filter</p>
          </div>
        ) : (
          groupedProducts.map((item, idx) =>
            item.type === "header" ? (
              <div key={`group-${item.groupId}`} className="col-span-full mt-2 first:mt-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-[var(--text-primary)] font-black text-sm uppercase tracking-widest">{item.name}</h3>
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
              </div>
            ) : (
              <ProductCard key={item.product.id} product={item.product} isAdmin={isAdmin} groupName={groupMap[item.product.group_id] || null} />
            )
          )
        )}
      </div>

      {showFilter && (
        <ProductFilterModal
          selectedFilter={pendingFilter}
          setSelectedFilter={setPendingFilter}
          selectedSort={pendingSort}
          setSelectedSort={setPendingSort}
          onApply={applyFilter}
          onClose={() => setShowFilter(false)}
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

export default CatalogueView;
