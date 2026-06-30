import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function SharedLedgerView() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      const [customerResult, transactionResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("transactions").select("*").eq("customer_id", id).order("created_at", { ascending: true }),
      ]);

      if (customerResult.error) {
        setError("Could not load customer ledger.");
        setLoading(false);
        return;
      }

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

      setCustomer(customerResult.data);
      setTransactions(transactionsWithItems);
      setLoading(false);
    };

    load();
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
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    let runningBalance = 0;
    const rows = sorted.map((txn) => {
      runningBalance += txn.type === "got" ? -Number(txn.amount) : Number(txn.amount);
      return { ...txn, balance: runningBalance };
    });
    return rows.reverse();
  }, [transactions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-[var(--primary)] animate-pulse-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <p className="text-[var(--text-secondary)] text-sm font-bold uppercase tracking-widest animate-pulse">Loading Ledger...</p>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
        <div className="card rounded-3xl p-8 shadow-md max-w-md text-center space-y-3">
          <svg className="w-10 h-10 mx-auto text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2 className="text-[var(--text-primary)] font-black text-lg">Ledger Not Found</h2>
          <p className="text-[var(--text-secondary)] text-sm font-medium">This link is invalid or the customer ledger has been removed.</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center pb-2">
          <div className="w-14 h-14 rounded-2xl bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-black tracking-tight">Ledger Statement</h1>
          <p className="text-[var(--text-secondary)] text-xs font-medium mt-1">{today}</p>
        </div>

        {/* Customer info */}
        <div className="card rounded-3xl p-6 shadow-md text-center">
          <h2 className="text-3xl font-black">{customer.name}</h2>
          {customer.phone && (
            <p className="text-[var(--text-secondary)] font-medium text-sm mt-1">{customer.phone}</p>
          )}

          {/* Balance */}
          <div className={`mt-6 rounded-2xl p-5 border ${
            balance > 0
              ? 'bg-[var(--primary-light)] border-[var(--primary)]/20'
              : balance < 0
              ? 'bg-[var(--secondary)] border-[var(--danger)]/20'
              : 'bg-[var(--surface)] border-[var(--border)]'
          }`}>
            <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Net Balance</p>
            <p className={`text-4xl font-black mt-1 ${
              balance > 0 ? "text-[var(--success)]" : balance < 0 ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"
            }`}>
              ₹{new Intl.NumberFormat("en-IN").format(balanceAmount)}
            </p>
            <p className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-wider mt-1">
              {balance === 0 ? "Settled" : balanceLabel}
            </p>
          </div>

          {/* Summary */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-4">
              <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Total Gave</p>
              <p className="text-[var(--danger)] text-xl font-black mt-1">₹{new Intl.NumberFormat("en-IN").format(totals.gave)}</p>
            </div>
            <div className="rounded-2xl bg-[var(--background)] border border-[var(--border)] p-4">
              <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">Total Received</p>
              <p className="text-[var(--success)] text-xl font-black mt-1">₹{new Intl.NumberFormat("en-IN").format(totals.got)}</p>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest px-1">Transaction History</h3>

          {transactionRows.length === 0 ? (
            <div className="card rounded-3xl py-12 text-center text-[var(--text-secondary)] font-medium text-sm">
              No transactions recorded.
            </div>
          ) : (
            <div className="space-y-2.5">
              {transactionRows.map((txn) => {
                const itemCount = txn.items?.length || 0;
                const isGot = txn.type === "got";
                return (
                  <div key={txn.id} className="card rounded-2xl p-4 hover:card-hover transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-wider">
                          {new Date(txn.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit", month: "short", year: "2-digit"
                          })}
                        </p>
                        {itemCount > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {txn.items.map((item, idx) => (
                              <p key={idx} className="text-[var(--text-primary)] font-semibold text-sm">
                                {item.products?.name} <span className="text-[var(--text-secondary)] font-medium">× {item.quantity}</span>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[var(--text-primary)] font-semibold text-sm mt-1.5">{itemCount > 0 ? `${itemCount} items` : "Entry"}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className={`inline-block font-black text-sm ${isGot ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {isGot ? "+" : "-"}₹{new Intl.NumberFormat("en-IN").format(txn.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-[var(--text-muted)] text-[10px] font-medium uppercase tracking-wider">
            Generated via Khata App
          </p>
        </div>
      </div>
    </div>
  );
}

export default SharedLedgerView;
