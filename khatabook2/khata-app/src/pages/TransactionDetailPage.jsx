import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { moveToRecycleBin } from "../lib/offline/db";
import { requirePermission, can } from "../lib/permissions";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHomePath() {
  const role = localStorage.getItem("khata_role");
  if (role === "admin") return "/admin/home";
  if (role === "employee") return "/employee/home";
  return "/";
}

function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState([]);
  const [runningBalance, setRunningBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      const { data: txn, error: txnErr } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", id)
        .single();

      if (txnErr || !txn) {
        setError("Transaction not found.");
        setLoading(false);
        return;
      }
      setTransaction(txn);

      const { data: cust } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", txn.customer_id)
        .single();
      setCustomer(cust);

      const { data: txItems } = await supabase
        .from("transaction_items")
        .select("id, transaction_id, product_id, quantity, price, products(name)")
        .eq("transaction_id", id);
      setItems(txItems || []);

      // Calculate running balance at this transaction's point in time
      const { data: allTxns } = await supabase
        .from("transactions")
        .select("id, type, amount, created_at")
        .eq("customer_id", txn.customer_id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (allTxns) {
        let bal = 0;
        for (const t of allTxns) {
          bal += t.type === "got" ? -Number(t.amount) : Number(t.amount);
          if (t.id === Number(id)) {
            setRunningBalance(bal);
            break;
          }
        }
      }

      setLoading(false);
    };

    load();
  }, [id]);

  const handleDelete = async () => {
    if (!requirePermission("delete_transaction")) return;
    setDeleting(true);
    setDeleteMsg("");

    try {
      const deletedBy = localStorage.getItem("khata_user") || "unknown";

      // Fetch COMPLETE transaction record before deletion
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

      const entityName = `Transaction #${id} - ${customer?.name || "Unknown"} (₹${Math.round((fullTransaction || transaction).amount)})`;

      await moveToRecycleBin("transactions", String(id), entityName, transactionToStore, deletedBy);

      const { error: dErr } = await offlineSupabase
        .from("transactions")
        .delete({ id })
        .eq("id", id);

      if (dErr) throw dErr;

      setShowDeleteModal(false);
      setDeleting(false);
      navigate(`/customer/${(fullTransaction || transaction).customer_id}`, { replace: true });
    } catch (err) {
      setDeleteMsg(err.message || "Failed to delete.");
      setDeleting(false);
    }
  };

  const handleShare = () => {
    if (!customer) return;

    const businessName = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";
    const dateStr = formatDate(transaction.created_at);
    const isGave = transaction.type === "gave";
    const typeLabel = isGave ? "You Gave" : "You Got";
    const itemsText = items.length > 0
      ? items.map((item) => `  ${item.products?.name || "Product"} x${item.quantity} — ₹${new Intl.NumberFormat("en-IN").format(item.price * item.quantity)}`).join("\n")
      : "  Cash/Direct Entry";

    const message = `${businessName}

Customer:
${customer.name}

Date:
${dateStr}

Items:
${itemsText}

Amount:
₹${new Intl.NumberFormat("en-IN").format(Math.round(transaction.amount))}

Type:
${typeLabel}

Balance After Transaction:
₹${new Intl.NumberFormat("en-IN").format(Math.abs(runningBalance || 0))} (${runningBalance >= 0 ? "You Will Get" : "You Will Give"})`;

    const raw = (customer.phone || "").replace(/[^0-9]/g, "");
    const phone = raw.length === 10 ? `91${raw}` : raw;
    if (!phone) {
      alert("Customer has no phone number saved.");
      return;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-black animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error && !transaction) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
        <div className="bg-[var(--danger-light)] border border-[var(--danger)]/20 text-[var(--danger)] text-sm font-bold p-5 rounded-2xl max-w-md text-center">{error}</div>
      </div>
    );
  }

  const isGave = transaction.type === "gave";
  const dateStr = formatDate(transaction.created_at);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] px-4 py-3 relative overflow-hidden select-none animate-fade-in">
      <div className="relative z-10 max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
          <div className="text-[var(--text-secondary)] text-[8px] uppercase font-black tracking-wider">ID #{id}</div>
        </div>

        {/* Customer Info Card */}
        <div className="card rounded-2xl px-4 py-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-black text-sm shrink-0">
              {customer?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => navigate(`/customer/${customer?.id}`)}
                className="text-sm font-black text-left hover:text-[var(--primary)] text-[var(--text-primary)] transition-all duration-200 cursor-pointer outline-none truncate max-w-full"
              >
                {customer?.name || "Unknown Customer"}
              </button>
              {customer?.phone && (
                <p className="text-[10px] text-[var(--text-secondary)] font-medium">{customer.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Transaction Type Badge */}
        <div className={`rounded-2xl px-4 py-3 border shadow-sm ${
          isGave ? "bg-[var(--secondary)] border-[var(--danger)]/20" : "bg-[var(--primary-light)] border-[var(--primary)]/20"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[8px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                {isGave ? "YOU GAVE" : "YOU GOT"}
              </div>
              {!isGave && transaction.payment_mode && (
                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  transaction.payment_mode === "online"
                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                }`}>
                  {transaction.payment_mode === "online" ? "Online" : "Cash"}
                </span>
              )}
            </div>
            <div className={`text-lg font-black ${isGave ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
              ₹{new Intl.NumberFormat("en-IN").format(Math.round(transaction.amount))}
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Running Balance
            </div>
            <div className={`text-[10px] font-black ${
              runningBalance > 0 ? "text-[var(--danger)]" : runningBalance < 0 ? "text-[var(--success)]" : "text-[var(--text-secondary)]"
            }`}>
              ₹{new Intl.NumberFormat("en-IN").format(Math.abs(runningBalance || 0))}
              <span className="text-[8px] text-[var(--text-secondary)] ml-1">
                {runningBalance >= 0 ? "Get" : "Give"}
              </span>
            </div>
          </div>
        </div>

        {/* Date & Details */}
        <div className="card rounded-2xl px-4 py-3 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-wider mb-0.5">Date</p>
              <p className="text-xs font-bold text-[var(--text-primary)]">{dateStr}</p>
            </div>
            <a
              href={`tel:${customer?.phone}`}
              className="rounded-xl bg-[var(--surface)] hover:bg-[var(--border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)] border border-[var(--border)] cursor-pointer outline-none active:scale-95 transition-all duration-200 flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>Call</span>
            </a>
          </div>

          {items.length > 0 && (
            <div>
              <p className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-wider mb-1">Products</p>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                        {item.products?.name || "Product"}
                      </p>
                      <p className="text-[9px] text-[var(--text-muted)]">
                        x{item.quantity} @ ₹{new Intl.NumberFormat("en-IN").format(item.price)}
                      </p>
                    </div>
                    <p className="text-[11px] font-bold text-[var(--text-primary)]">
                      ₹{new Intl.NumberFormat("en-IN").format(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transaction.description && (
            <div>
              <p className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-wider mb-0.5">Description</p>
              <p className="text-[11px] font-medium text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2">
                {transaction.description}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {can("edit_transaction") && (
            <button
              onClick={() => {
                navigate(`/customer/${transaction.customer_id}/transaction`, {
                  state: {
                    type: transaction.type,
                    editTransactionId: transaction.id,
                    amount: transaction.amount,
                    date: transaction.created_at,
                    paymentMode: transaction.payment_mode,
                    items: items.map(item => ({
                      product_id: item.product_id,
                      quantity: item.quantity,
                      price: item.price,
                    })),
                  },
                });
              }}
              className="w-full rounded-xl bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] py-3 text-[var(--text-primary)] font-bold text-[10px] uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Edit Entry</span>
            </button>
          )}

          <button
            onClick={handleShare}
            className="w-full rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white py-3 text-[10px] font-bold uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span>Share Entry</span>
          </button>

          {can("delete_transaction") && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full rounded-xl bg-[var(--secondary)] border border-[var(--danger)]/20 text-[var(--danger)] py-3 text-[10px] font-bold uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span>Delete Entry</span>
            </button>
          )}
        </div>
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
                This transaction will be moved to the recycle bin. You can restore it within 90 days.
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

export default TransactionDetailPage;
