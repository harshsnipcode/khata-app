import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function getHomePath() {
  try {
    const role = localStorage.getItem("khata_role");
    if (role === "admin") return "/admin/home";
    if (role === "employee") return "/employee/home";
  } catch {}
  return "/";
}

function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");

      const [customerResult, transactionResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("transactions").select("*").eq("customer_id", id).order("created_at", { ascending: true }),
      ]);

      if (customerResult.error) {
        setLoadError(customerResult.error.message || "Unable to load customer.");
      }

      if (transactionResult.error) {
        setLoadError(transactionResult.error.message || "Unable to load transaction history.");
      }

      // Fetch transaction items for each transaction
      let transactionsWithItems = transactionResult.data || [];
      
      if (transactionsWithItems.length > 0) {
        const itemsResult = await supabase
          .from("transaction_items")
          .select("transaction_id, product_id, quantity, price, products(name)")
          .in("transaction_id", transactionsWithItems.map(t => t.id));

        if (!itemsResult.error) {
          const itemsMap = {};
          itemsResult.data.forEach(item => {
            if (!itemsMap[item.transaction_id]) {
              itemsMap[item.transaction_id] = [];
            }
            itemsMap[item.transaction_id].push(item);
          });

          transactionsWithItems = transactionsWithItems.map(txn => ({
            ...txn,
            items: itemsMap[txn.id] || [],
          }));
        }
      }

      setCustomer(customerResult.data || null);
      setTransactions(transactionsWithItems);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`customer-details-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `customer_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_items" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const totals = useMemo(() => {
    return transactions.reduce(
      (acc, txn) => {
        if (txn.type === "got") acc.got += Number(txn.amount);
        else acc.gave += Number(txn.amount);
        return acc;
      },
      { got: 0, gave: 0 }
    );
  }, [transactions]);

  const balance = totals.gave - totals.got;
  const balanceLabel = balance >= 0 ? "You Will Get" : "You Will Give";
  const balanceAmount = Math.abs(balance);

  const transactionRows = useMemo(() => {
    let runningBalance = 0;
    const rows = transactions.map((txn) => {
      runningBalance += txn.type === "got" ? -Number(txn.amount) : Number(txn.amount);
      return {
        ...txn,
        balance: runningBalance,
      };
    });
    return rows.reverse();
  }, [transactions]);

  if (loading) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-black animate-pulse">Loading Ledger...</div>
    </div>
  );
  if (loadError) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
      <div className="bg-[var(--danger-light)] border border-[var(--danger)]/20 text-[var(--danger)] text-sm font-bold p-5 rounded-2xl max-w-md text-center">{loadError}</div>
    </div>
  );
  if (!customer) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-black">Customer Not Found</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 relative overflow-hidden select-none">
      <div className="relative z-10 max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(getHomePath())}
            className="flex items-center gap-2 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-4.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
          
          <div className="space-y-1 text-right">
            <div className="text-[var(--text-secondary)] text-[10px] uppercase font-black tracking-wider">Customer ID #{id}</div>
            <div className="text-[var(--success)] text-[10px] uppercase font-black tracking-widest">Updated Ledger</div>
          </div>
        </div>

        {/* Customer Glass Card */}
        <div className="card rounded-3xl p-6 shadow-md relative overflow-hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between relative z-10">
            <div>
              <div className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest mb-1.5">Customer Ledger</div>
              <button
                onClick={() => navigate(`/customer/${id}/profile`)}
                className="text-3xl font-black text-left hover:text-[var(--primary)] text-[var(--text-primary)] transition-all duration-200 group flex items-center gap-1.5 cursor-pointer outline-none"
                title="View profile"
              >
                <span>{customer.name}</span>
                <span className="text-xl text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors group-hover:translate-x-1 duration-200">›</span>
              </button>
              <div className="text-[var(--text-secondary)] font-medium text-sm mt-1.5 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>{customer.phone}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 relative z-10">
              <a 
                href={`tel:${customer.phone}`}
                className="rounded-2xl bg-[var(--surface)] hover:bg-[var(--border)] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border border-[var(--border)] cursor-pointer outline-none active:scale-95 transition-all duration-200 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>Call</span>
              </a>
              <span className="rounded-2xl bg-[var(--primary-light)] border border-[var(--primary)]/20 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--primary)] select-none">
                {customer.type || "Customer"}
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 relative z-10">
            <div className="rounded-3xl bg-[var(--background)] p-5 border border-[var(--border)] relative overflow-hidden">
              <div className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Total Gave (You Sold)</div>
              <div className="text-[var(--danger)] text-3xl font-black mt-2">
                ₹{new Intl.NumberFormat("en-IN").format(totals.gave)}
              </div>
            </div>
            
            <div className="rounded-3xl bg-[var(--background)] p-5 border border-[var(--border)] relative overflow-hidden">
              <div className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Total Got (You Received)</div>
              <div className="text-[var(--success)] text-3xl font-black mt-2">
                ₹{new Intl.NumberFormat("en-IN").format(totals.got)}
              </div>
            </div>
          </div>

          {/* Balance card */}
          <div className={`mt-6 rounded-3xl p-6 border relative overflow-hidden ${
            balance > 0 
              ? 'bg-[var(--secondary)] border-[var(--danger)]/20' 
              : balance < 0 
              ? 'bg-[var(--primary-light)] border-[var(--primary)]/20'
              : 'bg-[var(--background)] border border-[var(--border)]'
          }`}>
            <div className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Net Balance</div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mt-2">
              <div className={`text-4xl font-black ${
                balance > 0 ? "text-[var(--danger)]" : balance < 0 ? "text-[var(--success)]" : "text-[var(--text-secondary)]"
              }`}>
                ₹{new Intl.NumberFormat("en-IN").format(balanceAmount)}
              </div>
              <div className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-wider">
                {balance === 0 ? "Settled Ledger" : balanceLabel}
              </div>
            </div>
          </div>

          {/* Share & Remind */}
          <div className="mt-6 card rounded-2xl p-5 shadow-md relative z-10">
            <div className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider mb-4">Share & Remind</div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  const raw = (customer.phone || "").replace(/[^0-9]/g, "");
                  const phone = raw.length === 10 ? `91${raw}` : raw;
                  if (!phone) {
                    alert("Customer has no phone number saved.");
                    return;
                  }

                  const text = `Ledger Update - ${customer.name}: Balance Rs.${Math.round(balanceAmount)} (${balanceLabel}). View full ledger: ${window.location.origin}/share/customer/${id}`;
                  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

                  const opened = window.open(url, "_blank", "noopener,noreferrer");
                  if (!opened) window.location.href = url;
                }}
                className="flex-1 min-w-[120px] rounded-2xl bg-[#25D366] hover:bg-[#1da851] text-white py-3.5 px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
              </button>
              <button
                onClick={() => {
                  const phone = (customer.phone || "").replace(/[^0-9]/g, "");
                  if (!phone) {
                    alert("Customer has no phone number saved.");
                    return;
                  }

                  const text = `Ledger Update - ${customer.name}: Balance Rs.${Math.round(balanceAmount)} (${balanceLabel}). View full ledger: ${window.location.origin}/share/customer/${id}`;
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  const url = isIOS ? `sms:${phone}&body=${encodeURIComponent(text)}` : `sms:${phone}?body=${encodeURIComponent(text)}`;

                  window.location.href = url;
                }}
                className="flex-1 min-w-[120px] rounded-2xl bg-[var(--text-primary)] hover:bg-black text-white py-3.5 px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span>SMS</span>
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/share/customer/${id}`;
                  navigator.clipboard.writeText(url).then(() => {
                    alert("Share link copied to clipboard!");
                  }).catch(() => {
                    prompt("Copy this link:", url);
                  });
                }}
                className="flex-1 min-w-[120px] rounded-2xl bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text-primary)] py-3.5 px-4 text-xs font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 relative z-10">
            <button
              onClick={() => navigate(`/customer/${id}/transaction`, { state: { type: "gave" } })}
              className="rounded-2xl bg-[var(--secondary)] hover:bg-[var(--secondary-hover)] border border-[var(--danger)]/20 py-4.5 text-[var(--danger)] font-black text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.01] active:scale-95 cursor-pointer outline-none shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>You Gave (Out)</span>
            </button>
            <button
              onClick={() => navigate(`/customer/${id}/transaction`, { state: { type: "got" } })}
              className="rounded-2xl bg-[var(--primary-light)] hover:bg-[var(--primary-hover)]/15 border border-[var(--primary)]/20 py-4.5 text-[var(--primary)] font-black text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.01] active:scale-95 cursor-pointer outline-none shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>You Got (In)</span>
            </button>
          </div>
        </div>

        {/* History Area */}
        <div className="space-y-4 pt-4">
          <div className="flex items-baseline justify-between border-b border-[var(--border)] pb-3">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Transaction History</h2>
            <span className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Newest First</span>
          </div>

          {transactionRows.length === 0 ? (
            <div className="rounded-3xl card p-12 text-[var(--text-secondary)] text-center font-bold text-sm tracking-wide">
              No transactions recorded yet. Add your first transaction above.
            </div>
          ) : (
            <div className="space-y-3">
              {transactionRows.map((txn) => {
                const itemCount = txn.items?.length || 0;
                const displayText = itemCount > 0
                  ? `${itemCount} Product${itemCount !== 1 ? "s" : ""}`
                  : "Cash/Direct Entry";

                const isGot = txn.type === "got";
                const amountColor = isGot ? "text-[var(--success)]" : "text-[var(--danger)]";
                const itemBg = isGot ? "bg-[var(--primary-light)] border border-[var(--success)]/20" : "bg-[var(--secondary)] border border-[var(--danger)]/20";

                return (
                  <div
                    key={txn.id}
                    className="card rounded-2xl p-4.5 hover:card-hover hover:scale-[1.005] hover:shadow-md transition-all duration-200 flex items-center justify-between group relative overflow-hidden"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">
                        {new Date(txn.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {itemCount > 0 ? (
                        <div className="mt-2.5 space-y-1.5">
                          {txn.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                              <p className="text-[var(--text-primary)] font-semibold text-sm truncate">
                                {item.products?.name} <span className="text-[var(--text-secondary)] font-medium">× {item.quantity}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[var(--text-primary)] font-bold text-sm mt-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                          <span>{displayText}</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right shrink-0 ml-4">
                      <span className={`inline-block px-3 py-1.5 rounded-xl font-black text-sm tracking-wide ${itemBg} ${amountColor}`}>
                        {isGot ? "+" : "-"}₹{new Intl.NumberFormat("en-IN").format(txn.amount)}
                      </span>
                      <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider mt-2">
                        Bal: ₹{new Intl.NumberFormat("en-IN").format(txn.balance)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerDetails;
