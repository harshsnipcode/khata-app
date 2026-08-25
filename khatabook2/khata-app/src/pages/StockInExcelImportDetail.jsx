import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ImportStatusBadge from "../components/ImportStatusBadge";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function StockInExcelImportDetail() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    offlineSupabase
      .from("import_history")
      .select("*")
      .eq("id", importId)
      .single()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message || "Import record not found.");
        else setRecord(data);
      });
  }, [importId]);

  const stats = record?.import_statistics || {};
  const parsedPreview = (() => {
    if (!record?.parsed_preview) return [];
    if (Array.isArray(record.parsed_preview)) return record.parsed_preview;
    try { return JSON.parse(record.parsed_preview); } catch { return []; }
  })();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <button
          onClick={() => navigate("/admin/stock-in-excel")}
          className="text-xs font-bold text-[var(--primary)] cursor-pointer"
        >
          ← Back to Stock In Imports
        </button>

        {error ? (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 p-4 font-bold text-sm">{error}</div>
        ) : !record ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading import…</p>
        ) : (
          <>
            <section className="card rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">Stock In Import</p>
                  <h1 className="text-2xl font-black mt-1 break-all">{record.filename}</h1>
                </div>
                <ImportStatusBadge status={record.status} />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5 text-sm">
                <Info label="Uploaded" value={new Date(record.uploaded_at).toLocaleString("en-IN")} />
                <Info label="Imported by" value={record.uploader || "—"} />
                <Info label="Sheet" value={record.sheet_name || "—"} />
              </div>
            </section>

            <section className="card rounded-3xl p-5">
              <h2 className="font-black mb-4">Import Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Info label="Products imported" value={stats.productsImported ?? 0} />
                <Info label="Total stock added" value={`${stats.totalStockIn ?? 0} LTR`} />
                <Info label="Transactions created" value={stats.transactionsCreated ?? 0} />
              </div>
            </section>

            {parsedPreview.length > 0 && (
              <section className="card rounded-3xl p-5">
                <h2 className="font-black mb-4">Imported Products</h2>
                <div className="overflow-auto border border-[var(--border)] rounded-2xl max-h-[65vh]">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-[var(--primary-light)] sticky top-0 z-10">
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-left">Product</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">QTY</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">INVEN.</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] border-b border-[var(--border)] text-right">Total Stock In</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreview.map((item, i) => (
                        <tr key={i} className="bg-[var(--surface)] hover:bg-slate-900/5 transition">
                          <td className="px-4 py-2.5 border-b border-[var(--border)] font-bold">{item.productName}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--border)] text-right">{item.qty ?? 0}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--border)] text-right">{item.inven ?? 0}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--border)] font-black text-right text-[var(--primary)]">+{item.totalStockIn ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--primary-light)] sticky bottom-0 z-10">
                        <td className="px-4 py-2.5 font-black text-left" colSpan={3}>Total</td>
                        <td className="px-4 py-2.5 font-black text-right text-[var(--primary)]">
                          +{parsedPreview.reduce((sum, item) => sum + (item.totalStockIn || 0), 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
      <p className="font-black mt-1 truncate" title={String(value)}>{value}</p>
    </div>
  );
}

export default StockInExcelImportDetail;
