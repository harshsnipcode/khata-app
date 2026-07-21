import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import Header from "../components/Header";
import CustomerCard from "../components/CustomerCard";
import { getSavedTemplate, fillTemplate } from "../lib/reminderTemplate";

function buildBalanceMap(transactions) {
  const map = {};
  for (const txn of transactions) {
    if (!map[txn.customer_id]) map[txn.customer_id] = 0;
    if (txn.type === "gave") map[txn.customer_id] += Number(txn.amount);
    else map[txn.customer_id] -= Number(txn.amount);
  }
  return map;
}

export default function ReminderPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [balanceFilter, setBalanceFilter] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [session, setSession] = useState(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  const businessName = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").order("name", { ascending: true }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
    ]).then(([custRes, txnRes]) => {
      setCustomers(custRes.data || []);
      setTransactions(txnRes.data || []);
      setLoading(false);
    });
  }, []);

  const balanceMap = useMemo(() => buildBalanceMap(transactions), [transactions]);

  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (balanceFilter === "pending") {
      list = list.filter((c) => (balanceMap[c.id] ?? 0) > 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [customers, balanceMap, balanceFilter, searchQuery]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startSession = () => {
    const ordered = filteredCustomers.filter((c) => selectedIds.has(c.id));
    setSession({ queue: ordered });
    setSessionIndex(0);
    setSessionDone(false);
  };

  const currentCustomer = session ? session.queue[sessionIndex] : null;
  const totalSelected = selectedIds.size;

  const sendReminder = () => {
    const customer = currentCustomer;
    if (!customer) return;
    const raw = (customer.phone || "").replace(/[^0-9]/g, "");
    const phone = raw.length === 10 ? `91${raw}` : raw;
    if (!phone) {
      alert("Customer has no phone number saved.");
      return;
    }
    const bal = balanceMap[customer.id] ?? 0;
    const template = getSavedTemplate();
    const text = fillTemplate(template, {
      customerName: customer.name,
      balance: Math.round(Math.abs(bal)),
      balanceType: bal > 0 ? "You Will Get" : "Settled",
      ledgerLink: `${window.location.origin}/share/customer/${customer.id}`,
      businessName,
    });
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  };

  const nextCustomer = () => {
    if (sessionIndex + 1 >= session.queue.length) {
      setSessionDone(true);
    } else {
      setSessionIndex((i) => i + 1);
    }
  };

  const finish = () => {
    setSession(null);
    setSessionIndex(0);
    setSessionDone(false);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const remaining = session ? session.queue.length - sessionIndex - 1 : 0;

  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="relative z-10 animate-fade-in">
        <Header businessName={businessName} />

        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          {!session ? (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 min-w-0">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl text-[10px] font-medium bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--primary)]/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 outline-none transition placeholder:text-[var(--text-muted)]"
                  />
                </div>
                {!sessionDone && (
                  <button
                    onClick={() => {
                      if (selectMode) {
                        setSelectMode(false);
                        setSelectedIds(new Set());
                      } else {
                        setSelectMode(true);
                      }
                    }}
                    className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)] hover:text-[var(--primary-hover)] transition cursor-pointer outline-none px-3 py-1.5 rounded-xl bg-[var(--primary-light)] border border-[var(--primary)]/20 shrink-0"
                  >
                    {selectMode ? "Cancel" : "Select"}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex gap-2">
                  {["pending", "all"].map((f) => (
                    <button
                      key={f}
                      onClick={() => { setBalanceFilter(f); setSelectedIds(new Set()); }}
                      className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer outline-none ${
                        balanceFilter === f
                          ? "bg-[var(--primary)] text-white shadow-sm"
                          : "bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--border)]"
                      }`}
                    >
                      {f === "pending" ? "Pending Balance Only" : "All Customers"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/settings")}
                  className="w-7 h-7 rounded-xl flex items-center justify-center bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition cursor-pointer outline-none shrink-0"
                >
                  <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              </div>

              {loading ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-14 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full" />
                  ))}
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
                  <p className="font-bold text-sm">No customers to remind.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCustomers.map((customer) => {
                    const bal = balanceMap[customer.id] ?? 0;
                    const selected = selectedIds.has(customer.id);
                    return (
                      <div
                        key={customer.id}
                        onClick={() => selectMode && toggleSelect(customer.id)}
                        className={`relative ${selectMode ? "cursor-pointer" : ""}`}
                      >
                        {selectMode && (
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => { e.stopPropagation(); toggleSelect(customer.id); }}
                              className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
                            />
                          </div>
                        )}
                        <div className={selectMode ? "pl-10" : ""}>
                          <CustomerCard
                            id={customer.id}
                            initial={customer.name?.[0]?.toUpperCase()}
                            name={customer.name}
                            time={customer.created_at}
                            balance={bal}
                            onClick={
                              selectMode
                                ? (e) => { e.stopPropagation(); toggleSelect(customer.id); }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectMode && totalSelected > 0 && (
                <div className="sticky bottom-4 z-20">
                  <button
                    onClick={startSession}
                    className="w-full bg-[#25D366] hover:bg-[#1da851] text-white font-bold py-4 rounded-2xl text-sm uppercase tracking-widest transition active:scale-95 cursor-pointer shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Send WhatsApp Reminders ({totalSelected})
                  </button>
                </div>
              )}
            </>
          ) : sessionDone ? (
            <div className="card rounded-3xl p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-black text-[var(--text-primary)]">All reminders completed</h2>
              <p className="text-[var(--text-secondary)] text-sm font-medium">{session.queue.length} reminders processed.</p>
              <button
                onClick={finish}
                className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold px-8 py-3 rounded-2xl transition active:scale-95 cursor-pointer text-sm uppercase tracking-widest"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card rounded-3xl p-6 text-center space-y-4">
                <p className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest">Bulk Reminder</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-black text-[var(--primary)]">{sessionIndex + 1}</p>
                    <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider">Completed</p>
                    <p className="text-[var(--text-muted)] text-[10px]">of {session.queue.length}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-[var(--text-primary)]">{remaining}</p>
                    <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider">Remaining</p>
                  </div>
                </div>
              </div>

              <div className="card rounded-3xl p-6 text-center space-y-3">
                <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider">Current Customer</p>
                <p className="text-lg font-black text-[var(--text-primary)]">{currentCustomer?.name}</p>
                <p className="text-sm font-medium text-[var(--text-secondary)]">
                  Balance: ₹{new Intl.NumberFormat("en-IN").format(Math.abs(balanceMap[currentCustomer?.id] ?? 0))}
                  {" "}{(balanceMap[currentCustomer?.id] ?? 0) > 0 ? "(You Will Get)" : ""}
                </p>
              </div>

              <button
                onClick={sendReminder}
                className="w-full bg-[#25D366] hover:bg-[#1da851] text-white font-bold py-4 rounded-2xl text-sm uppercase tracking-widest transition active:scale-95 cursor-pointer shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Open WhatsApp
              </button>

              <button
                onClick={nextCustomer}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl text-sm uppercase tracking-widest transition active:scale-95 cursor-pointer shadow-sm"
              >
                Next Customer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
