import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import { supabase } from "../lib/supabase";

function ExcelImportDetail() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const businessName = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";

  useEffect(() => {
    supabase.from("import_history").select("*").eq("id", importId).single().then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message || "Import record not found.");
      else setRecord(data);
    });
  }, [importId]);

  const stats = record?.import_statistics || {};
  const report = record?.validation_report || {};
  const preview = Array.isArray(record?.parsed_preview) ? record.parsed_preview : [];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <Header businessName={businessName} />
      <Navbar activeTab="excel" isAdmin={true} />
      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        <button onClick={() => navigate("/admin/excel")} className="text-xs font-bold text-[var(--primary)] cursor-pointer">← Back to Excel imports</button>
        {error ? <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 p-4 font-bold text-sm">{error}</div> : !record ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading import…</p>
        ) : (
          <>
            <section className="card rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">Excel Import</p><h1 className="text-2xl font-black mt-1 break-all">{record.filename}</h1></div>
                <span className="px-3 py-1.5 rounded-full bg-[var(--primary-light)] text-[var(--primary)] text-[10px] font-black uppercase">{record.status.replaceAll("_", " ")}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 text-sm">
                <Info label="Uploaded" value={new Date(record.uploaded_at).toLocaleString("en-IN")} />
                <Info label="Imported by" value={record.uploader} />
                <Info label="Worksheet" value={record.sheet_name || "—"} />
                <Info label="File hash" value={record.file_hash} mono />
              </div>
            </section>

            <section className="card rounded-3xl p-5">
              <h2 className="font-black mb-4">Import Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Customers", stats.customersProcessed], ["Products", stats.productsProcessed],
                  ["Transactions", stats.transactionsCreated], ["Skipped", stats.rowsSkipped],
                  ["Unknown customers", stats.unknownCustomers], ["Unknown products", stats.unknownProducts],
                  ["Total quantity", stats.totalQuantityImported], ["Time", stats.processingTimeMs === undefined ? "—" : `${(stats.processingTimeMs / 1000).toFixed(2)}s`],
                ].map(([label, value]) => <Info key={label} label={label} value={value ?? 0} />)}
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mt-5">
                <List title="Unknown Customers" items={report.unknownCustomers} />
                <List title="Unknown Products" items={report.unknownProducts} />
                <List title="Validation Errors" items={report.errors} />
              </div>
            </section>

            <section className="card rounded-3xl p-5">
              <div className="mb-4"><h2 className="font-black">Uploaded Spreadsheet Preview</h2><p className="text-xs text-[var(--text-secondary)] mt-1">Stored parsed copy of the original worksheet.</p></div>
              <div className="overflow-auto border border-[var(--border)] rounded-2xl max-h-[65vh]">
                <table className="min-w-full text-sm border-collapse">
                  <tbody>
                    {preview.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? "bg-[var(--primary-light)] sticky top-0" : "bg-[var(--surface)]"}>
                        {(row || []).map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-4 py-2.5 border-b border-r border-[var(--border)] whitespace-nowrap">
                            {cell === null || cell === "" ? <span className="text-[var(--text-muted)]">—</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Info({ label, value, mono = false }) {
  return <div className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-3 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">{label}</p><p className={`font-black mt-1 truncate ${mono ? "font-mono text-xs" : ""}`} title={String(value)}>{value}</p></div>;
}

function List({ title, items = [] }) {
  if (!items?.length) return null;
  return <div><p className="text-xs font-black uppercase tracking-wide mb-2">{title}</p><ul className="text-sm text-[var(--text-secondary)] max-h-40 overflow-auto space-y-1">{items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></div>;
}

export default ExcelImportDetail;

