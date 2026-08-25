import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ImportStatusBadge from "../components/ImportStatusBadge";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function StockInExcelImportPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await offlineSupabase
      .from("import_history")
      .select("id, filename, uploaded_at, uploader, status, import_statistics, sheet_name")
      .eq("sheet_name", "Stock In")
      .order("uploaded_at", { ascending: false });
    if (!error) setHistory(data || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadHistory, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Stock In Excel Import History</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Previous stock-in imports from Excel files.</p>
          </div>
          <button
            onClick={() => navigate("/admin/home", { state: { activeTab: "catalogue" } })}
            className="px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-bold uppercase tracking-widest hover:border-[var(--border-hover)] text-[var(--text-primary)] transition cursor-pointer"
          >
            ← Back
          </button>
        </div>

        {loadingHistory ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading imports…</p>
        ) : history.length === 0 ? (
          <div className="card rounded-2xl p-8 text-center text-sm text-[var(--text-secondary)]">
            No stock-in Excel imports yet.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => {
              const stats = item.import_statistics || {};
              const date = new Date(item.uploaded_at);
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/admin/stock-in-excel/${item.id}`)}
                  className="w-full card rounded-2xl p-4 flex items-center gap-4 text-left hover:card-hover transition cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black shrink-0">
                    XLS
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{item.filename}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      {date.toLocaleDateString("en-IN")} · {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      {item.uploader ? ` · by ${item.uploader}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <ImportStatusBadge status={item.status} />
                    <p className="text-sm font-black mt-1">{stats.productsImported || 0} products</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{stats.totalStockIn || 0} LTR</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default StockInExcelImportPage;
