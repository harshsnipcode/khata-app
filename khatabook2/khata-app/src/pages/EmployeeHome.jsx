import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import SummaryCard from "../components/SummaryCard";
import CustomerCard from "../components/CustomerCard";
import FloatingButton from "../components/FloatingButton";
import SearchBar from "../components/SearchBar";
import FilterModal from "../components/FilterModal";
import CatalogueView from "../components/CatalogueView";
import { supabase } from "../lib/supabase";



/* ── helpers (shared logic, identical to AdminHome) ──── */

function buildBalanceMap(transactions) {
  const map = {};
  for (const txn of transactions) {
    if (!map[txn.customer_id]) map[txn.customer_id] = 0;
    if (txn.type === "gave") map[txn.customer_id] += Number(txn.amount);
    else                     map[txn.customer_id] -= Number(txn.amount);
  }
  return map;
}

function applyFilterAndSort(customers, balanceMap, searchTerm, filterType, sortType) {
  let list = customers.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.phone?.includes(searchTerm)
    );
  });

  list = list.filter((c) => {
    const bal = balanceMap[c.id] ?? 0;
    if (filterType === "get")     return bal > 0;
    if (filterType === "give")    return bal < 0;
    if (filterType === "settled") return bal === 0;
    return true;
  });

  list = [...list].sort((a, b) => {
    const balA = balanceMap[a.id] ?? 0;
    const balB = balanceMap[b.id] ?? 0;
    if (sortType === "recent")  return new Date(b.created_at) - new Date(a.created_at);
    if (sortType === "oldest")  return new Date(a.created_at) - new Date(b.created_at);
    if (sortType === "highest") return Math.abs(balB) - Math.abs(balA);
    if (sortType === "lowest")  return Math.abs(balA) - Math.abs(balB);
    if (sortType === "az")      return (a.name || "").localeCompare(b.name || "");
    return 0;
  });

  return list;
}

/* ── component ───────────────────────────────────────── */

function EmployeeHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab]       = useState(location.state?.activeTab || "customers");

  const [customers,    setCustomers]    = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Search / filter / sort
  const [searchTerm,  setSearchTerm]    = useState("");
  const [filterType,  setFilterType]    = useState("all");
  const [sortType,    setSortType]      = useState("recent");

  // Pending state inside modal
  const [pendingFilter, setPendingFilter] = useState("all");
  const [pendingSort,   setPendingSort]   = useState("recent");
  const [showFilter,    setShowFilter]    = useState(false);

  /* ── data loading ── */
  const load = useCallback(async () => {
    setLoading(true);
    const [custRes, txnRes] = await Promise.all([
      supabase.from("customers").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("customer_id, type, amount"),
    ]);
    setCustomers(custRes.data || []);
    setTransactions(txnRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();

    const channel = supabase
      .channel("employee-home-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  /* ── derived state ── */
  const balanceMap = useMemo(() => buildBalanceMap(transactions), [transactions]);

  const summaryTotals = useMemo(() => {
    let youGet = 0, youGive = 0;
    customers.forEach((c) => {
      const bal = balanceMap[c.id] ?? 0;
      if (bal > 0) youGet  += bal;
      else         youGive += Math.abs(bal);
    });
    return { youGet, youGive };
  }, [customers, balanceMap]);

  const displayedCustomers = useMemo(
    () => applyFilterAndSort(customers, balanceMap, searchTerm, filterType, sortType),
    [customers, balanceMap, searchTerm, filterType, sortType]
  );

  const activeFilterCount = (filterType !== "all" ? 1 : 0) + (sortType !== "recent" ? 1 : 0);

  const openFilter = () => {
    setPendingFilter(filterType);
    setPendingSort(sortType);
    setShowFilter(true);
  };

  const applyFilter = () => {
    setFilterType(pendingFilter);
    setSortType(pendingSort);
    setShowFilter(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="relative z-10 animate-fade-in">
         <Header businessName={localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy"} isAdmin={false} />
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={false} />

        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          {activeTab === "customers" && (
            <>
              <SummaryCard youGive={summaryTotals.youGive} youGet={summaryTotals.youGet} />

              {/* Search + Filter */}
              <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onOpenFilter={openFilter}
                activeCount={activeFilterCount}
              />

              {/* Active filter pills */}
              {(filterType !== "all" || sortType !== "recent") && (
                <div className="flex flex-wrap gap-2 -mt-2 animate-fade-in">
                  {filterType !== "all" && (
                    <span className="inline-flex items-center gap-1.5 bg-[var(--primary-light)] border border-[var(--primary)]/20 text-[var(--primary)] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                      <span>{filterType === "get" ? "You Will Get" : filterType === "give" ? "You Will Give" : "Settled"}</span>
                      <button onClick={() => setFilterType("all")} className="hover:text-[var(--text-primary)] transition cursor-pointer text-xs font-bold leading-none">×</button>
                    </span>
                  )}
                  {sortType !== "recent" && (
                    <span className="inline-flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                      <span>{sortType === "oldest" ? "Oldest" : sortType === "highest" ? "Highest Amount" : sortType === "lowest" ? "Least Amount" : "A → Z"}</span>
                      <button onClick={() => setSortType("recent")} className="hover:text-[var(--text-primary)] transition cursor-pointer text-xs font-bold leading-none">×</button>
                    </span>
                  )}
                </div>
              )}

              {/* Customer list */}
              <div className="space-y-2">
                {loading && (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="h-14 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full" />
                    ))}
                  </div>
                )}

                {!loading && displayedCustomers.length === 0 && (
                  <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
                    <svg className="w-10 h-10 mx-auto text-slate-350 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p className="font-bold text-sm tracking-wide">
                      {searchTerm || filterType !== "all"
                        ? "No customers match your search or filter."
                        : "No customers yet."}
                    </p>
                  </div>
                )}

                {!loading && displayedCustomers.map((customer) => (
                  <CustomerCard
                    key={customer.id}
                    id={customer.id}
                    initial={customer.name?.[0]?.toUpperCase()}
                    name={customer.name}
                    time={customer.created_at}
                    balance={balanceMap[customer.id] ?? 0}
                  />
                ))}
              </div>
            </>
          )}

          {activeTab === "catalogue" && (
            <CatalogueView isAdmin={false} />
          )}

        </div>

        <FloatingButton onClick={() => window.location.href = '/customers/add'} isVisible={activeTab === "customers"} />
      </div>

      {/* Filter modal */}
      {showFilter && (
        <FilterModal
          selectedFilter={pendingFilter}
          setSelectedFilter={setPendingFilter}
          selectedSort={pendingSort}
          setSelectedSort={setPendingSort}
          onApply={applyFilter}
          onClose={() => setShowFilter(false)}
        />
      )}
    </div>
  );
}

export default EmployeeHome;
