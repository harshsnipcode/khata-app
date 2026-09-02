import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ImportStatusBadge from "../components/ImportStatusBadge";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import { deleteImportBatch, getImportActor } from "../lib/importReversal";

function StockInExcelImportDetail() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteFromListConfirm, setShowDeleteFromListConfirm] = useState(false);
  const [showDeleteAbandonedConfirm, setShowDeleteAbandonedConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingFromList, setDeletingFromList] = useState(false);
  const [deletingAbandoned, setDeletingAbandoned] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  const isDeleted = record?.status === "deleted";
  const isProcessing = record?.status === "processing";
  const canDelete = ["imported", "restored", "completed", "completed_with_errors"].includes(record?.status);

  const handleDeleteImport = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      if (!navigator.onLine) {
        throw new Error("Deleting a Stock In import requires an internet connection.");
      }
      await deleteImportBatch(importId, getImportActor());
      navigate("/admin/stock-in-excel", { replace: true });
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete this import.");
      setDeleting(false);
    }
  };

  const handleDeleteFromList = async () => {
    setDeletingFromList(true);
    setDeleteError("");
    try {
      if (!navigator.onLine) {
        throw new Error("Deleting an import from the list requires an internet connection.");
      }
      const { error: deleteHistoryError } = await supabase
        .from("import_history")
        .delete()
        .eq("id", importId)
        .eq("status", "deleted");
      if (deleteHistoryError) throw deleteHistoryError;
      navigate("/admin/stock-in-excel", { replace: true });
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete this import from the list.");
      setDeletingFromList(false);
    }
  };

  const handleDeleteAbandoned = async () => {
    setDeletingAbandoned(true);
    setDeleteError("");
    try {
      if (!navigator.onLine) {
        throw new Error("Deleting an import requires an internet connection.");
      }
      const { data: linkedRows } = await supabase
        .from("product_transactions")
        .select("id")
        .eq("import_history_id", importId);
      if (linkedRows?.length) {
        const rowIds = linkedRows.map((row) => row.id);
        await supabase.from("product_transactions").delete().in("id", rowIds);
      }
      const { error: deleteError } = await supabase
        .from("import_history")
        .delete()
        .eq("id", importId);
      if (deleteError) throw deleteError;
      navigate("/admin/stock-in-excel", { replace: true });
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || "Unable to delete this import.");
      setDeletingAbandoned(false);
    }
  };

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
                <Info label="Stock-in entries" value={stats.transactionsCreated ?? 0} />
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

            <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5">
              <h2 className="font-black text-rose-600">Delete This Import</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {isProcessing
                  ? "Remove this unfinished import from the history."
                  : "Remove every Stock In created by this Excel import as one reversible batch."}
              </p>
              {isDeleted ? (
                <>
                  <p className="mt-4 text-sm font-bold text-[var(--text-secondary)]">This import has already been deleted.</p>
                  <button onClick={() => setShowDeleteFromListConfirm(true)} className="mt-4 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wide cursor-pointer active:scale-95 transition">
                    Delete from List
                  </button>
                </>
              ) : isProcessing ? (
                <>
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">This import never completed. You can remove it from the history.</p>
                  <button onClick={() => setShowDeleteAbandonedConfirm(true)} className="mt-4 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wide cursor-pointer active:scale-95 transition">
                    Delete Import
                  </button>
                </>
              ) : canDelete ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="mt-4 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wide cursor-pointer active:scale-95 transition">
                  Delete This Import
                </button>
              ) : null}
              {deleteError && <p className="mt-3 text-sm font-bold text-rose-600">{deleteError}</p>}
            </section>
          </>
        )}
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-2xl">
            <h2 className="text-lg font-black">Delete this imported Stock In file?</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2">This will roll back every Stock In entry and product-stock increase created by this import. It can be restored later from the Recycle Bin.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button disabled={deleting} onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold cursor-pointer disabled:opacity-50">Cancel</button>
              <button disabled={deleting} onClick={handleDeleteImport} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFromListConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-2xl">
            <h2 className="text-lg font-black">Delete this import from the list?</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2">This will permanently remove only this deleted import history record. The stock rollback already done will not change.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button disabled={deletingFromList} onClick={() => setShowDeleteFromListConfirm(false)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold cursor-pointer disabled:opacity-50">Cancel</button>
              <button disabled={deletingFromList} onClick={handleDeleteFromList} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">
                {deletingFromList ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAbandonedConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-2xl">
            <h2 className="text-lg font-black">Delete abandoned import?</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2">This import never completed. Deleting it will remove this unfinished import and any partial Stock In entries it created.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button disabled={deletingAbandoned} onClick={() => setShowDeleteAbandonedConfirm(false)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold cursor-pointer disabled:opacity-50">Cancel</button>
              <button disabled={deletingAbandoned} onClick={handleDeleteAbandoned} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">
                {deletingAbandoned ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
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
