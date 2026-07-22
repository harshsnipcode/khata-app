import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSwipeNavigation from "../hooks/useSwipeNavigation";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import ImportStatusBadge from "../components/ImportStatusBadge";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import { createGaveTransaction } from "../lib/transactionService";
import { collectExcelRowItems, collectStockInItems } from "../lib/excelImportGrouping";
import { excludeTotalSummaries } from "../lib/excelImportValidation";
import {
  hashFile,
  normalizeImportName,
  normalizeProductName,
  parseExcelWorkbook,
} from "../lib/excelImport";
import { createStockInAdjustment } from "../lib/transactionService";
import { saveFetchedData } from "../lib/offline/db";

const EMPTY_REPORT = { unknownCustomers: [], unknownProducts: [], errors: [] };
const CATALOGUE_PAGE_SIZE = 1000;

async function fetchAllCatalogueNames() {
  const names = [];
  for (let from = 0; ; from += CATALOGUE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("name")
      .range(from, from + CATALOGUE_PAGE_SIZE - 1);
    if (error) throw error;
    names.push(...(data || []).map((product) => product.name));
    if (!data || data.length < CATALOGUE_PAGE_SIZE) return names;
  }
}

function relationErrorMessage(error) {
  if (error?.code === "42P01" || error?.message?.includes("import_history")) {
    return "Import History is not configured. Run db/create_import_history_table.sql in Supabase first.";
  }
  return error?.message || "Unable to process the Excel file.";
}

function ExcelImportPage() {
  const navigate = useNavigate();
  useSwipeNavigation({
    onSwipeLeft: () => {
      navigate("/admin/staff", { state: { activeTab: "employees" } });
    },
    onSwipeRight: () => {
      navigate("/admin/home", { state: { activeTab: "catalogue" } });
    },
  });
  const inputRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const businessName = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await offlineSupabase
      .from("import_history")
      .select("id, filename, uploaded_at, uploader, status, import_statistics, is_reimport")
      .order("uploaded_at", { ascending: false });
    if (error) setMessage(relationErrorMessage(error));
    else setHistory(data || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadHistory, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  const runImport = async (prepared, forceReimport = false) => {
    setImporting(true);
    setPendingDuplicate(null);
    setMessage("");
    setSummary(null);
    setReport(EMPTY_REPORT);
    const startedAt = performance.now();
    let historyId = null;

    try {
      if (!navigator.onLine) throw new Error("Bulk Excel import requires an internet connection.");

      const { error: reversalSetupError } = await supabase
        .from("import_batch_recycle_bin")
        .select("id")
        .limit(1);
      if (reversalSetupError) {
        throw new Error("Import Batch Reversal is not configured. Run db/extend_import_history_batch_reversal.sql in Supabase first.");
      }

      const userResult = await supabase.auth.getUser();
      const uploader = userResult?.data?.user?.id || localStorage.getItem("khata_user") || "admin";
      const { data: historyRow, error: historyError } = await supabase
        .from("import_history")
        .insert([{
          filename: prepared.file.name,
          uploader,
          file_hash: prepared.fileHash,
          sheet_name: prepared.parsed.sheetName,
          parsed_preview: prepared.parsed.preview,
          stock_in_preview: prepared.parsed.stockInData?.preview || null,
          status: "processing",
          is_reimport: forceReimport,
          source_import_id: forceReimport ? prepared.duplicate?.id : null,
        }])
        .select("id")
        .single();
      if (historyError) throw historyError;
      historyId = historyRow.id;

      // All reference data is loaded once; the transaction writes themselves
      // still pass through the shared manual transaction service.
      const [customerResult, productResult, priceResult] = await Promise.all([
        supabase.from("customers").select("id, name"),
        supabase.from("products").select("id, name, sale_price, stock_quantity"),
        supabase.from("customer_product_prices").select("customer_id, product_id, custom_price"),
      ]);
      if (customerResult.error) throw customerResult.error;
      if (productResult.error) throw productResult.error;
      if (priceResult.error) throw priceResult.error;

      const customerMap = new Map((customerResult.data || []).map((item) => [normalizeImportName(item.name), item]));
      const productMap = new Map((productResult.data || []).map((item) => [normalizeProductName(item.name), item]));
      const priceMap = new Map((priceResult.data || []).map((item) => [
        `${item.customer_id}:${item.product_id}`,
        Number(item.custom_price),
      ]));
      const processingView = excludeTotalSummaries(prepared.parsed);
      const productHeaders = processingView.productHeaders;
      productHeaders.forEach((header) => {
        console.log(`Excel header:\nOriginal: ${header}\nNormalized: ${normalizeProductName(header)}`);
      });
      (productResult.data || []).forEach((product) => {
        console.log(`Catalogue product:\nOriginal: ${product.name}\nNormalized: ${normalizeProductName(product.name)}`);
      });
      const unknownProducts = [...new Set(productHeaders.filter((name) => !productMap.has(normalizeProductName(name))))];
      const unknownCustomers = [...new Set(
        processingView.rows
          .map((row) => row.customerName)
          .filter((name) => name && !customerMap.has(normalizeImportName(name))),
      )];
      
      // Process optional Stock In data
      const stockInResult = collectStockInItems({
        stockInData: prepared.parsed.stockInData,
        productMap,
      });
      const stockUnknownProducts = stockInResult.unknownProducts || [];
      
      // Merge unknown products from both customer transactions and stock in
      const allUnknownProducts = [...new Set([...unknownProducts, ...stockUnknownProducts])];
      
      const errors = [...(stockInResult.errors || [])];
      const processedCustomers = new Set();
      const processedProducts = new Set();
      let transactionsCreated = 0;
      let stockInAdjustmentsCreated = 0;
      let rowsSkipped = 0;
      let totalQuantity = 0;
      let stockInTotalQuantity = 0;
      const soldQuantityByProduct = new Map();

      // Validate: check if any unknown products exist before proceeding
      if (allUnknownProducts.length > 0) {
        throw new Error(`Unknown products detected. Please check the validation report.`);
      }

      // Process customer transactions
      for (const row of processingView.rows) {
        const customer = customerMap.get(normalizeImportName(row.customerName));
        const groupedRow = collectExcelRowItems({
          row,
          customer,
          productHeaders,
          productMap,
          priceMap,
        });
        rowsSkipped += groupedRow.skipped;
        errors.push(...groupedRow.errors);

        if (!customer || groupedRow.items.length === 0) continue;

        try {
          await createGaveTransaction({
            customerId: customer.id,
            createdBy: uploader,
            importHistoryId: historyId,
            items: groupedRow.items,
          });
          transactionsCreated += 1;
          processedCustomers.add(customer.id);
          for (const item of groupedRow.items) {
            totalQuantity += item.quantity;
            processedProducts.add(item.product.id);
            soldQuantityByProduct.set(
              item.product.id,
              (soldQuantityByProduct.get(item.product.id) || 0) + item.quantity,
            );
          }
        } catch (error) {
          rowsSkipped += groupedRow.items.length;
          errors.push(`Row ${row.rowNumber}: ${error.message || "transaction failed"}`);
        }
      }

      // Process Stock In adjustments
      console.log("Total Parsed:", (stockInResult.items || []).length);
      let stockInFailed = 0;
      for (const stockItem of (stockInResult.items || [])) {
        try {
          const soldQuantity = soldQuantityByProduct.get(stockItem.product.id) || 0;
          console.log("Customer Sold Quantity:", soldQuantity);
          console.log("Expected Net Stock Change:", Number(stockItem.quantity) - Number(soldQuantity));
          await createStockInAdjustment({
            product: stockItem.product,
            quantity: stockItem.quantity,
            createdBy: uploader,
            notes: `Imported from Excel`,
            importHistoryId: historyId,
            excelProductName: stockItem.productName,
            normalizedName: stockItem.normalizedName,
          });
          stockInAdjustmentsCreated += 1;
          stockInTotalQuantity += stockItem.quantity;
          processedProducts.add(stockItem.product.id);
        } catch (error) {
          stockInFailed += 1;
          errors.push(`Row ${stockItem.rowNumber}, ${stockItem.product.name}: ${error.message || "stock adjustment failed"}`);
        }
      }
      console.log("Total Updated:", stockInAdjustmentsCreated);
      console.log("Total Failed:", stockInFailed);

      // Reconcile stock for all products so stock_quantity always matches
      // the product_transactions ledger, regardless of whether individual
      // RPCs / UPDATEs succeeded.
      if (processedProducts.size > 0) {
        try {
          const { data: reconciled, error: reconErr } = await supabase.rpc(
            "reconcile_product_inventory_from_ledger"
          );
          if (!reconErr && Array.isArray(reconciled)) {
            await saveFetchedData(
              "products",
              reconciled.map((r) => ({ id: r.product_id, stock_quantity: r.reconciled_stock }))
            );
          } else if (reconErr) {
            console.warn("Reconcile RPC unavailable; individual adjustments should have set stock:", reconErr);
          }
        } catch (reconCatch) {
          console.warn("Reconcile RPC failed (non-fatal):", reconCatch);
        }
      }

      const statistics = {
        customersProcessed: processedCustomers.size,
        productsProcessed: processedProducts.size,
        transactionsCreated,
        stockInAdjustmentsCreated,
        rowsSkipped,
        unknownCustomers: unknownCustomers.length,
        unknownProducts: allUnknownProducts.length,
        totalQuantityImported: totalQuantity,
        totalStockInQuantity: stockInTotalQuantity,
        processingTimeMs: Math.round(performance.now() - startedAt),
      };
      const validationReport = { unknownCustomers, unknownProducts: allUnknownProducts, errors };
      const { error: updateError } = await supabase
        .from("import_history")
        .update({
          import_statistics: statistics,
          validation_report: validationReport,
          status: "imported",
        })
        .eq("id", historyId);
      if (updateError) throw updateError;

      setSummary(statistics);
      setReport(validationReport);
      setMessage("Import Successful");
      await loadHistory();
    } catch (error) {
      const errorMessage = relationErrorMessage(error);
      setMessage(errorMessage);
      if (historyId) {
        await supabase
          .from("import_history")
          .update({
            status: "failed",
            validation_report: { ...EMPTY_REPORT, errors: [errorMessage] },
            import_statistics: { processingTimeMs: Math.round(performance.now() - startedAt) },
          })
          .eq("id", historyId);
        await loadHistory();
      }
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const prepareFile = async (file) => {
    if (!file) return;
    setMessage("");
    setSummary(null);
    setReport(EMPTY_REPORT);
    setPendingDuplicate(null);

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setMessage("Please upload an .xlsx or .xls file.");
      return;
    }
    if (!navigator.onLine) {
      setMessage("Bulk Excel import requires an internet connection.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const [catalogueProductNames, fileHash] = await Promise.all([
        fetchAllCatalogueNames(),
        hashFile(arrayBuffer),
      ]);
      const parsed = await parseExcelWorkbook(arrayBuffer, catalogueProductNames);
      const { data: duplicate, error } = await supabase
        .from("import_history")
        .select("id, filename, uploaded_at")
        .eq("file_hash", fileHash)
        .in("status", ["processing", "imported", "deleted", "restored", "completed", "completed_with_errors"])
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const prepared = { file, parsed, fileHash, duplicate };
      if (duplicate) {
        setPendingDuplicate(prepared);
        setMessage("This file has already been imported.");
      } else {
        await runImport(prepared, false);
      }
    } catch (error) {
      setMessage(relationErrorMessage(error));
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <Header businessName={businessName} />
      <Navbar activeTab="excel" isAdmin={localStorage.getItem("khata_role") === "admin"} />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div>
          <h1 className="text-2xl font-black">Bulk Excel Transaction Import</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Each non-zero cell becomes a normal You Gave transaction.</p>
        </div>

        <section
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            prepareFile(event.dataTransfer.files?.[0]);
          }}
          className={`card rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center transition ${dragging ? "border-[var(--primary)] bg-[var(--primary-light)]" : "border-[var(--border)]"}`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0-12 4 4m-4-4L8 7"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
          </div>
          <h2 className="font-black text-lg">Upload your Excel file</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 mb-5">Drag and drop here, or choose a file. Supported: .xlsx, .xls</p>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => prepareFile(event.target.files?.[0])} />
          <button disabled={importing} onClick={() => inputRef.current?.click()} className="px-6 py-3 rounded-2xl bg-[var(--primary)] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
            {importing ? "Importing…" : "Upload Excel File"}
          </button>
        </section>

        {message && (
          <section className={`rounded-2xl border p-4 ${message === "Import Successful" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-amber-500/10 border-amber-500/20 text-amber-700"}`}>
            <p className="font-black text-sm">{message}</p>
            {pendingDuplicate && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => runImport(pendingDuplicate, true)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer">Re-import anyway</button>
                <button onClick={() => { setPendingDuplicate(null); setMessage(""); }} className="px-4 py-2 rounded-xl bg-white/70 text-xs font-bold cursor-pointer">Cancel</button>
              </div>
            )}
          </section>
        )}

        {summary && (
          <section className="card rounded-3xl p-5">
            <h2 className="font-black mb-4">Import Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Customers processed", summary.customersProcessed],
                ["Products processed", summary.productsProcessed],
                ["Transactions created", summary.transactionsCreated],
                ["Stock adjustments", summary.stockInAdjustmentsCreated || 0],
                ["Rows skipped", summary.rowsSkipped],
                ["Unknown customers", summary.unknownCustomers],
                ["Unknown products", summary.unknownProducts],
                ["Total quantity", summary.totalQuantityImported + (summary.totalStockInQuantity || 0)],
                ["Processing time", `${(summary.processingTimeMs / 1000).toFixed(2)}s`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-3">
                  <p className="text-xl font-black">{value}</p><p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wide mt-1">{label}</p>
                </div>
              ))}
            </div>
            {(report.unknownCustomers.length > 0 || report.unknownProducts.length > 0 || report.errors.length > 0) && (
              <div className="grid sm:grid-cols-3 gap-4 mt-5 text-sm">
                <ValidationList title="Unknown Customers" items={report.unknownCustomers} />
                <ValidationList title="Unknown Products" items={report.unknownProducts} />
                <ValidationList title="Validation Errors" items={report.errors} />
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="font-black text-lg mb-3">Import History</h2>
          {loadingHistory ? <p className="text-sm text-[var(--text-secondary)]">Loading uploads…</p> : history.length === 0 ? (
            <div className="card rounded-2xl p-8 text-center text-sm text-[var(--text-secondary)]">No Excel imports yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => {
                const stats = item.import_statistics || {};
                const date = new Date(item.uploaded_at);
                return (
                  <button key={item.id} onClick={() => navigate(`/admin/excel/${item.id}`)} className="w-full card rounded-2xl p-4 flex items-center gap-4 text-left hover:card-hover transition cursor-pointer">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black shrink-0">XLS</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{item.filename}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">{date.toLocaleDateString("en-IN")} · {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · by {item.uploader}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <ImportStatusBadge status={item.status} />
                      <p className="text-sm font-black">{stats.transactionsCreated || 0} created</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">{stats.rowsSkipped || 0} skipped</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ValidationList({ title, items }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-black text-xs uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1 text-[var(--text-secondary)] max-h-40 overflow-auto">
        {items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
      </ul>
    </div>
  );
}

export default ExcelImportPage;
