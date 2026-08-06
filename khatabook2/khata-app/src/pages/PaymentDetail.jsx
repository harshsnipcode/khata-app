import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { moveToRecycleBin } from "../lib/offline/db";

function formatPaymentDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCreatedAt(dateStr) {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PaymentDetail() {
  const { id, paymentId } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await supabase.from("employees").select("*").eq("id", id).single();
      setEmployee(emp);

      const { data: pay, error: payErr } = await supabase
        .from("salary_payments")
        .select("*")
        .eq("id", paymentId)
        .single();

      if (payErr || !pay) {
        setError("Payment not found.");
        setLoading(false);
        return;
      }
      setPayment(pay);
      setLoading(false);
    };
    load();
  }, [id, paymentId]);

  const startEdit = () => {
    setAmount(String(payment.amount));
    setNotes(payment.notes || "");
    setPaymentDate((payment.payment_date || "").split("T")[0]);
    setError("");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }
    if (!paymentDate) {
      setError("Please select a payment date");
      return;
    }

    setSaving(true);
    setError("");

    const { error: updateError } = await offlineSupabase
      .from("salary_payments")
      .update({
        amount: Number(amount),
        notes,
        payment_date: paymentDate,
      })
      .eq("id", paymentId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    navigate(`/admin/employees/${id}/summary`, { replace: true });
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteMsg("");

    try {
      const deletedBy = localStorage.getItem("khata_user") || "unknown";
      const entityName = `Salary payment of ₹${Math.round(Number(payment.amount))} for ${employee?.username || "Employee"} (${formatPaymentDate(payment.payment_date)})`;

      await moveToRecycleBin("salary_payments", String(payment.id), entityName, payment, deletedBy);

      const { error: dErr } = await offlineSupabase
        .from("salary_payments")
        .delete({ id: payment.id })
        .eq("id", payment.id);

      if (dErr) throw dErr;

      setShowDeleteModal(false);
      setDeleting(false);
      navigate(`/admin/employees/${id}/summary`, { replace: true });
    } catch (err) {
      setDeleteMsg(err.message || "Failed to delete.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
        <div className="bg-[var(--danger-light)] border border-[var(--danger)]/20 text-[var(--danger)] text-sm font-bold p-5 rounded-2xl max-w-md text-center">{error || "Payment not found."}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate(`/admin/employees/${id}/summary`)}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          {employee?.username || "Back"}
        </button>

        {/* Employee Info */}
        <div className="card rounded-3xl p-6 shadow-md flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
            {employee?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-[var(--text-primary)] font-bold text-lg truncate">{employee?.username || "Employee"}</p>
            <p className="text-[var(--text-muted)] text-xs font-medium">Payment Details · ID #{payment.id}</p>
          </div>
        </div>

        {/* Amount Card */}
        <div className="card rounded-3xl p-6 shadow-md">
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Payment Amount</p>
          <p className="text-[var(--primary)] text-3xl font-bold">₹{Math.round(Number(payment.amount)).toLocaleString()}</p>
        </div>

        {!editing ? (
          <>
            {/* Payment Details */}
            <div className="card rounded-3xl p-6 shadow-md space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Payment Date</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">{formatPaymentDate(payment.payment_date)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Recorded On</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">{formatCreatedAt(payment.created_at)}</span>
              </div>
              {payment.notes && (
                <div className="py-2 border-b border-[var(--border)]">
                  <p className="text-sm text-[var(--text-secondary)] font-medium mb-1">Notes</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{payment.notes}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                onClick={startEdit}
                className="w-full rounded-xl bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] py-3 text-[var(--text-primary)] font-bold text-[10px] uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Edit Payment</span>
              </button>

              <button
                onClick={() => setShowDeleteModal(true)}
                className="w-full rounded-xl bg-[var(--secondary)] border border-[var(--danger)]/20 text-[var(--danger)] py-3 text-[10px] font-bold uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                <span>Delete Payment</span>
              </button>
            </div>
          </>
        ) : (
          /* Edit Form */
          <div className="card rounded-3xl p-6 shadow-md space-y-5">
            <h2 className="text-[var(--text-primary)] font-bold text-base">Edit Payment</h2>

            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] font-bold text-sm">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="15000"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-10 pr-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this payment"
                rows={3}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm resize-none"
              />
            </div>

            {error && (
              <div className="p-3.5 rounded-2xl text-xs font-semibold border bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setEditing(false); setError(""); }}
                disabled={saving}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-4 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
        >
          <div
            className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-[var(--secondary)] border border-[var(--danger)]/20 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 className="text-lg font-black uppercase tracking-wider text-[var(--text-primary)]">Move to Recycle Bin?</h2>
              <p className="text-[var(--text-secondary)] text-sm mt-2 font-medium">
                This payment will be moved to the recycle bin. You can restore it within 90 days.
              </p>
            </div>
            {deleteMsg && (
              <div className="mt-3 text-[var(--danger)] text-xs font-bold text-center">{deleteMsg}</div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteMsg(""); }}
                disabled={deleting}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-[var(--danger)] hover:bg-[#d45a3d] text-white font-black py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
              >
                {deleting ? "Moving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentDetail;
