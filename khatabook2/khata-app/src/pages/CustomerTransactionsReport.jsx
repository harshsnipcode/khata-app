import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

function formatINR(n) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CustomerTransactionsReport() {
  const navigate = useNavigate();
  const location = useLocation();
  const reportRef = useRef(null);

  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [durationFilter, setDurationFilter] = useState("all");
  const [singleDay, setSingleDay] = useState("");

  const [businessName] = useState(() => localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy");
  const [paymentFilter, setPaymentFilter] = useState(null);

  const params = new URLSearchParams(location.search);
  const customerFilterId = Number(params.get("customerId")) || "";
  const customerFilterName = params.get("customerName") || "";

  const loadData = useCallback(async () => {
    const [txnRes, custRes] = await Promise.all([
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, phone"),
    ]);
    if (!txnRes.error) setTransactions(txnRes.data || []);
    if (!custRes.error) setCustomers(custRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  const now = new Date();

  const effectiveDates = useMemo(() => {
    let s = null, e = null;

    if (durationFilter === "this_month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
      e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (durationFilter === "last_week") {
      e = new Date(now);
      s = new Date(now);
      s.setDate(s.getDate() - 7);
    } else if (durationFilter === "last_month") {
      s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      e = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (durationFilter === "single_day" && singleDay) {
      s = new Date(singleDay);
      e = new Date(singleDay);
    } else if (durationFilter === "date_range") {
      if (startDate) s = new Date(startDate);
      if (endDate) e = new Date(endDate);
    }

    return {
      start: s ? getDateStr(s) : "",
      end: e ? getDateStr(e) : "",
    };
  }, [durationFilter, singleDay, startDate, endDate, now]);

  const customerMap = useMemo(() => {
    const map = {};
    customers.forEach((c) => { map[c.id] = c; });
    return map;
  }, [customers]);

  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    if (customerFilterId) {
      list = list.filter((t) => t.customer_id === customerFilterId);
    }

    if (effectiveDates.start) {
      list = list.filter((t) => {
        const txnDate = t.created_at?.split("T")[0] || t.date;
        return txnDate >= effectiveDates.start;
      });
    }
    if (effectiveDates.end) {
      list = list.filter((t) => {
        const txnDate = t.created_at?.split("T")[0] || t.date;
        return txnDate <= effectiveDates.end;
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((t) => {
        const cust = customerMap[t.customer_id];
        const name = cust?.name?.toLowerCase() || "";
        const phone = cust?.phone || "";
        const desc = t.description?.toLowerCase() || "";
        return name.includes(term) || phone.includes(term) || desc.includes(term);
      });
    }

    return list;
  }, [transactions, effectiveDates, searchTerm, customerMap]);

  const summary = useMemo(() => {
    let totalGave = 0, totalGot = 0, onlineGot = 0, cashGot = 0;
    filteredTransactions.forEach((t) => {
      if (t.type === "gave") totalGave += Number(t.amount);
      else {
        totalGot += Number(t.amount);
        if (t.payment_mode === "online") onlineGot += Number(t.amount);
        else cashGot += Number(t.amount);
      }
    });
    return {
      netBalance: totalGot - totalGave,
      totalEntries: filteredTransactions.length,
      totalGave,
      totalGot,
      onlineGot,
      cashGot,
    };
  }, [filteredTransactions]);

  const runningBalance = useMemo(() => {
    let bal = 0;
    const sorted = [...filteredTransactions].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    return sorted.map((t) => {
      if (t.type === "gave") bal += Number(t.amount);
      else bal -= Number(t.amount);
      return { ...t, runningBal: bal };
    }).reverse();
  }, [filteredTransactions]);

  const displayTransactions = useMemo(() => {
    if (!paymentFilter) return runningBalance;
    return runningBalance.filter((t) => {
      if (paymentFilter === "cash") return t.type === "got" && t.payment_mode === "cash";
      if (paymentFilter === "online") return t.type === "got" && t.payment_mode === "online";
      return true;
    });
  }, [runningBalance, paymentFilter]);

  const handleDurationSelect = (key) => {
    setDurationFilter(key);
    if (key === "single_day") setSingleDay(getDateStr(new Date()));
    else setSingleDay("");
    if (key !== "date_range") { setStartDate(""); setEndDate(""); }
    setShowDurationModal(false);
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(businessName, pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(8);
    doc.text(`Generated: ${now.toLocaleDateString("en-IN")}`, pageWidth / 2, 27, { align: "center" });

    if (effectiveDates.start || effectiveDates.end) {
      doc.text(`Period: ${effectiveDates.start || "…"} — ${effectiveDates.end || "…"}`, pageWidth / 2, 33, { align: "center" });
    }

    doc.setFontSize(10);
    let y = 42;
    doc.text(`Net Balance: ₹${formatINR(summary.netBalance)}`, 14, y); y += 6;
    doc.text(`Total Entries: ${summary.totalEntries}`, 14, y); y += 6;
    doc.text(`Total You Gave: ₹${formatINR(summary.totalGave)}`, 14, y); y += 6;
    doc.text(`Total You Got: ₹${formatINR(summary.totalGot)}`, 14, y); y += 8;

    // Table header
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const cols = ["Customer", "Date", "Type", "Amount", "Balance"];
    const colWidths = [50, 30, 20, 25, 25];
    let x = 14;
    cols.forEach((c, i) => {
      doc.text(c, x, y);
      x += colWidths[i];
    });
    y += 4;
    doc.line(14, y - 1, pageWidth - 14, y - 1);
    doc.setFont("helvetica", "normal");

    runningBalance.forEach((t) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const cust = customerMap[t.customer_id];
      const name = cust?.name || `#${t.customer_id}`;
      const date = (t.created_at?.split("T")[0] || t.date || "");
      const type = t.type === "gave" ? "Gave" : "Got";
      const amt = `₹${formatINR(t.amount)}`;
      const bal = `₹${formatINR(Math.abs(t.runningBal))}`;

      x = 14;
      doc.text(name.substring(0, 18), x, y); x += colWidths[0];
      doc.text(date, x, y); x += colWidths[1];
      doc.text(type, x, y); x += colWidths[2];
      doc.text(amt, x, y); x += colWidths[3];
      doc.text(bal, x, y);
      y += 5;
    });

    doc.save(`customer-report-${getDateStr(now)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto p-6 space-y-5 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate("/admin/home")}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Home
        </button>

        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {customerFilterName ? `Report of ${customerFilterName}` : "Customer Transactions Report"}
        </h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Net Balance</p>
            <p className={`text-lg font-bold mt-1 ${summary.netBalance > 0 ? "text-[#e76f51]" : summary.netBalance < 0 ? "text-[#52b788]" : "text-[var(--text-primary)]"}`}>
              ₹{formatINR(Math.abs(summary.netBalance))}
            </p>
          </div>
          <div className="card rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Entries</p>
            <p className="text-lg font-bold mt-1 text-[var(--text-primary)]">{summary.totalEntries}</p>
          </div>
          <div className="card rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">You Gave</p>
            <p className="text-lg font-bold mt-1 text-[#e76f51]">₹{formatINR(summary.totalGave)}</p>
          </div>
          <div className="card rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">You Got</p>
            <p className="text-lg font-bold mt-1 text-[#52b788]">₹{formatINR(summary.totalGot)}</p>
            <div className="flex flex-wrap gap-x-1 items-center text-sm font-semibold mt-1">
              <span className="whitespace-nowrap">
                <button
                  onClick={() => setPaymentFilter(paymentFilter === "cash" ? null : "cash")}
                  className={`inline transition cursor-pointer outline-none ${paymentFilter === "cash" ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                >
                  Cash
                </button>{' '}
                <span className={`${paymentFilter === "cash" ? "text-[var(--primary)]" : "text-[#52b788]"}`}>₹{formatINR(summary.cashGot)}</span>
                <span className="text-[var(--text-muted)]"> • </span>
              </span>
              <span className="whitespace-nowrap">
                <button
                  onClick={() => setPaymentFilter(paymentFilter === "online" ? null : "online")}
                  className={`inline transition cursor-pointer outline-none ${paymentFilter === "online" ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                >
                  Online
                </button>{' '}
                <span className={`${paymentFilter === "online" ? "text-[var(--primary)]" : "text-[#52b788]"}`}>₹{formatINR(summary.onlineGot)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Start Date */}
          <div className="flex-1 min-w-[120px]">
            <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Start Date</p>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDurationFilter("date_range"); }}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">End Date</p>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDurationFilter("date_range"); }}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition"
            />
          </div>
          <button
            onClick={() => setShowDurationModal(true)}
            className="self-end px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--surface)] transition cursor-pointer outline-none flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            {durationFilter === "all" ? "All" : durationFilter.replace("_", " ")}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-11 pr-5 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
            placeholder="Search Entries"
          />
        </div>

        {/* Transactions List */}
        <div ref={reportRef} className="space-y-1">
          {loading ? (
            <div className="space-y-1 animate-pulse">
              <div className="h-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full" />
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-14 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full" />
              ))}
            </div>
          ) : displayTransactions.length === 0 ? (
            <div className="rounded-2xl card py-12 text-center text-[var(--text-secondary)]">
              <p className="font-bold text-sm">No transactions found.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-3 border-b border-[var(--border)] bg-[var(--background)]">
                <div className="flex items-center gap-2">
                  {paymentFilter && (
                    <button
                      onClick={() => setPaymentFilter(null)}
                      className="shrink-0 w-7 h-7 flex items-center justify-center text-base font-bold text-gray-600 hover:text-gray-900 transition cursor-pointer outline-none"
                      title="Clear filter"
                    >
                      ←
                    </button>
                  )}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Total Entries</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{paymentFilter ? displayTransactions.length : summary.totalEntries}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--danger)]">You Gave</p>
                  <p className="text-sm font-bold text-[var(--danger)] mt-0.5">₹{formatINR(summary.totalGave)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[var(--success)]">You Got</p>
                  <p className="text-sm font-bold text-[var(--success)] mt-0.5">₹{formatINR(summary.totalGot)}</p>
                </div>
              </div>

              {/* Transaction Rows */}
              <div className="divide-y divide-[var(--border)]">
                {displayTransactions.map((t) => {
                  const cust = customerMap[t.customer_id];
                  const date = new Date(t.created_at || t.date);
                  const isGave = t.type === "gave";
                  const paymentBadge = !isGave && t.payment_mode
                    ? t.payment_mode === "online" ? "Online" : "Cash"
                    : null;
                  const description = cust?.name || `Customer #${t.customer_id}`;
                  return (
                    <div
                      key={t.id}
                      onClick={() => navigate(`/admin/reports/customer-transactions/${t.id}`)}
                      className="px-3 py-2.5 hover:bg-[var(--surface)] cursor-pointer transition-colors"
                    >
                      <div className="grid grid-cols-[1fr_80px_80px] gap-2 items-start">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="break-words">{description}</span>
                            {paymentBadge && (
                              <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                paymentBadge === "Online"
                                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}>
                                {paymentBadge}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">
                            {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {t.description && (
                            <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5 break-words">
                              {t.description}
                            </p>
                          )}
                        </div>
                        <div className="text-center">
                          {isGave && (
                            <p className="text-sm font-bold text-[var(--danger)]">
                              ₹{formatINR(t.amount)}
                            </p>
                          )}
                          {!isGave && (
                            <p className="text-sm font-bold text-[var(--text-muted)]">—</p>
                          )}
                        </div>
                        <div className="text-center">
                          {!isGave && (
                            <p className="text-sm font-bold text-[var(--success)]">
                              ₹{formatINR(t.amount)}
                            </p>
                          )}
                          {isGave && (
                            <p className="text-sm font-bold text-[var(--text-muted)]">—</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Download PDF */}
        <button
          onClick={handleDownloadPDF}
          disabled={displayTransactions.length === 0}
          className="w-full py-3.5 rounded-2xl bg-[var(--danger)] hover:bg-[#d45a3d] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Download PDF
        </button>
      </div>

      {/* Duration Filter Modal */}
      {showDurationModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowDurationModal(false)}
        >
          <div className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Filter by Duration</h2>
            <div className="space-y-2">
              {[
                { key: "all", label: "All" },
                { key: "this_month", label: "This Month" },
                { key: "single_day", label: "Single Day" },
                { key: "last_week", label: "Last Week" },
                { key: "last_month", label: "Last Month" },
                { key: "date_range", label: "Date Range" },
              ].map((opt) => (
                <div key={opt.key}>
                  <label
                    onClick={() => handleDurationSelect(opt.key)}
                    className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                      durationFilter === opt.key
                        ? "border-[var(--primary)] bg-[var(--primary-light)]"
                        : "border-[var(--border)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        durationFilter === opt.key ? "border-[var(--primary)]" : "border-[var(--border)]"
                      }`}>
                        {durationFilter === opt.key && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</span>
                    </div>
                  </label>
                  {opt.key === "single_day" && durationFilter === "single_day" && (
                    <input
                      type="date"
                      value={singleDay}
                      onChange={(e) => setSingleDay(e.target.value)}
                      className="mt-2 ml-7 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowDurationModal(false)}
              className="w-full mt-5 py-3.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerTransactionsReport;
