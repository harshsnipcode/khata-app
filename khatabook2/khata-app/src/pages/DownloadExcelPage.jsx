import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  buildTransactionExportMatrix,
  downloadTransactionWorkbook,
  toInclusiveDateRange,
  toLocalDateInput,
} from "../lib/excelExport";

const PAGE_SIZE = 1000;

async function fetchEveryPage(createQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function DownloadExcelPage() {
  const navigate = useNavigate();
  const today = toLocalDateInput(new Date());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(today);
  const [matrix, setMatrix] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    supabase
      .from("transactions")
      .select("created_at")
      .not("created_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(error.message || "Unable to find the earliest transaction.");
        setStartDate(data?.created_at ? toLocalDateInput(data.created_at) : today);
      });
    return () => { active = false; };
  }, [today]);

  const prepareExport = useCallback(async () => {
    if (!startDate || !endDate) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (startDate > endDate) {
      setMessage("Start Date cannot be after End Date.");
      setMatrix(null);
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const { start, endExclusive } = toInclusiveDateRange(startDate, endDate);
      const [customers, products, transactions] = await Promise.all([
        fetchEveryPage(() => supabase
          .from("customers")
          .select("id, name, route_position, created_at")
          .order("route_position", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })),
        fetchEveryPage(() => supabase
          .from("products")
          .select("id, name, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })),
        fetchEveryPage(() => supabase
          .from("transactions")
          .select("id, customer_id, type, created_at, transaction_items(product_id, quantity)")
          .eq("type", "gave")
          .gte("created_at", start)
          .lt("created_at", endExclusive)
          .order("created_at", { ascending: true })),
      ]);

      if (products.length === 0) {
        throw new Error("There are no catalogue products to export.");
      }
      if (requestId !== requestIdRef.current) return;

      const nextMatrix = buildTransactionExportMatrix(customers, products, transactions);
      setMatrix(nextMatrix);
      setSummary({
        customersIncluded: customers.length,
        productsIncluded: products.length,
        transactionsIncluded: transactions.length,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setMessage(error.message || "Unable to prepare the Excel export.");
      setMatrix(null);
      setSummary(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!startDate || !endDate) return undefined;
    const timeout = window.setTimeout(prepareExport, 200);
    return () => window.clearTimeout(timeout);
  }, [startDate, endDate, prepareExport]);

  const handleDownload = async () => {
    if (!matrix || loading) return;
    setDownloading(true);
    setMessage("");
    try {
      await downloadTransactionWorkbook(
        matrix,
        `Transactions_${startDate}_to_${endDate}.xlsx`,
      );
    } catch (error) {
      setMessage(error.message || "Unable to download the Excel file.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] px-4 py-4 animate-fade-in">
      <main className="max-w-3xl mx-auto space-y-5">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-1.5 text-xs font-bold text-[var(--primary)] cursor-pointer">
          ← Back to Settings
        </button>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">Excel</p>
          <h1 className="text-2xl font-black mt-1">Export Transactions</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Download product quantities in the same format accepted by Bulk Excel Import.</p>
        </div>

        <section className="card rounded-3xl p-5 shadow-sm space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Start Date</span>
              <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)]" />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">End Date</span>
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)]" />
            </label>
          </div>

          <div>
            <h2 className="font-black text-sm mb-3">Export Summary</h2>
            {loading ? (
              <div className="h-20 rounded-2xl bg-[var(--background)] animate-pulse" />
            ) : summary ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryValue label="Customers Included" value={summary.customersIncluded} />
                <SummaryValue label="Products Included" value={summary.productsIncluded} />
                <SummaryValue label="Transactions Included" value={summary.transactionsIncluded} />
                <SummaryValue label="Date Range" value={`${startDate} to ${endDate}`} small />
              </div>
            ) : null}
          </div>

          <button onClick={handleDownload} disabled={!matrix || loading || downloading} className="w-full py-4 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-black text-xs uppercase tracking-[0.15em] transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:pointer-events-none">
            {downloading ? "Generating Excel…" : "Download Excel"}
          </button>
        </section>

        {message && <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 p-4 text-sm font-bold">{message}</div>}
      </main>
    </div>
  );
}

function SummaryValue({ label, value, small = false }) {
  return (
    <div className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-3 min-w-0">
      <p className={`${small ? "text-xs" : "text-xl"} font-black truncate`} title={String(value)}>{value}</p>
      <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

export default DownloadExcelPage;
