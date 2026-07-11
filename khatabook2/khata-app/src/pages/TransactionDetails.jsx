import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { moveToRecycleBin } from "../lib/offline/db";

function TransactionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: txn } = await supabase.from("transactions").select("*").eq("id", id).single();
      if (txn) {
        setTransaction(txn);
        const { data: cust } = await supabase.from("customers").select("name, phone").eq("id", txn.customer_id).single();
        setCustomer(cust);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const deletedBy = localStorage.getItem("khata_user") || "unknown";

      // Fetch COMPLETE transaction record and items before deletion
      const { data: fullTransaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", id)
        .single();
      const { data: transactionItems } = await supabase
        .from("transaction_items")
        .select("*")
        .eq("transaction_id", id);
      const transactionToStore = {
        transaction: fullTransaction || transaction,
        transaction_items: transactionItems || [],
      };
      console.log("[RecycleBin] Full transaction being stored:", transactionToStore);

      const entityName = `Transaction #${id} - ${customer?.name || "Unknown"} (₹${Math.round((fullTransaction || transaction)?.amount || 0)})`;
      await moveToRecycleBin("transactions", String(id), entityName, transactionToStore, deletedBy);

      const { error } = await offlineSupabase.from("transactions").delete({ id }).eq("id", id);
      if (!error) {
        navigate("/admin/reports/customer-transactions", { replace: true });
      }
    } catch (e) {
      console.error("Delete error:", e);
    }
    setDeleting(false);
    setShowDeleteModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Transaction not found.</div>
      </div>
    );
  }

  const date = new Date(transaction.created_at || transaction.date);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate("/admin/reports/customer-transactions")}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Reports
        </button>

        {/* Customer Info */}
        <div className="card rounded-3xl p-6 shadow-md">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
              {customer?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="text-[var(--text-primary)] font-bold text-lg">{customer?.name || "Unknown"}</p>
              <p className="text-[var(--text-muted)] text-xs font-medium">{customer?.phone || ""}</p>
            </div>
          </div>
        </div>

        {/* Transaction Details */}
        <div className="card rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <p className="text-[var(--text-primary)] font-bold text-base">Transaction Details</p>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              transaction.type === "gave" ? "bg-[#d8f3e3] text-[#2d6a4f]" : "bg-[#fde8e2] text-[#e76f51]"
            }`}>
              {transaction.type === "gave" ? "You Gave" : "You Got"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Date & Time</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Amount</p>
              <p className={`text-lg font-bold ${transaction.type === "gave" ? "text-[#52b788]" : "text-[#e76f51]"}`}>
                ₹{new Intl.NumberFormat("en-IN").format(Math.round(transaction.amount))}
              </p>
            </div>
          </div>

          {transaction.description && (
            <div>
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Details</p>
              <p className="text-sm text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3">
                {transaction.description}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting}
            className="w-full py-3.5 rounded-2xl border border-[var(--danger)]/30 text-[var(--danger)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--danger-light)] transition cursor-pointer outline-none active:scale-95 disabled:opacity-60"
          >
            Delete Entry
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowDeleteModal(false)}
        >
          <div className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Delete Entry</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">The transaction will be moved to the recycle bin. You can restore it within 90 days.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3.5 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--surface)] transition cursor-pointer outline-none active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3.5 rounded-2xl bg-[var(--danger)] hover:bg-[#d45a3d] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionDetails;
