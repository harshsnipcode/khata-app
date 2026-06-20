import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import SummaryCard from "../components/SummaryCard";
import CustomerCard from "../components/CustomerCard";
import FloatingButton from "../components/FloatingButton";
import SearchBar from "../components/SearchBar";
import FilterModal from "../components/FilterModal";
import CatalogueView from "../components/CatalogueView";


/* ── helpers ─────────────────────────────────────────── */

/** Build a map: customer_id → net balance (gave - got) */
function buildBalanceMap(transactions) {
  const map = {};
  for (const txn of transactions) {
    if (!map[txn.customer_id]) map[txn.customer_id] = 0;
    if (txn.type === "gave") map[txn.customer_id] += Number(txn.amount);
    else                     map[txn.customer_id] -= Number(txn.amount);
  }
  return map;
}

function applyFilterAndSort(customers, balanceMap, lastActivityMap, searchTerm, filterType, sortType) {
  // 1. Search
  let list = customers.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.phone?.includes(searchTerm)
    );
  });

  // 2. Filter by balance
  list = list.filter((c) => {
    const bal = balanceMap[c.id] ?? 0;
    if (filterType === "get")     return bal > 0;
    if (filterType === "give")    return bal < 0;
    if (filterType === "settled") return bal === 0;
    return true; // "all"
  });

  // 3. Sort
  list = [...list].sort((a, b) => {
    const balA = balanceMap[a.id] ?? 0;
    const balB = balanceMap[b.id] ?? 0;
    if (sortType === "recent" || sortType === "oldest") {
      const aTime = lastActivityMap[a.id] || a.created_at;
      const bTime = lastActivityMap[b.id] || b.created_at;
      return sortType === "recent"
        ? new Date(bTime) - new Date(aTime)
        : new Date(aTime) - new Date(bTime);
    }
    if (sortType === "highest") return Math.abs(balB) - Math.abs(balA);
    if (sortType === "lowest")  return Math.abs(balA) - Math.abs(balB);
    if (sortType === "az")      return (a.name || "").localeCompare(b.name || "");
    return 0;
  });

  return list;
}

/* ── component ───────────────────────────────────────── */

function AdminHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab]       = useState(location.state?.activeTab || "customers");
  const [username,  setUsername]        = useState("");
  const [password,  setPassword]        = useState("");
  const [message,   setMessage]         = useState("");

  const [businessName, setBusinessName] = useState(() => localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy");
  const [editName, setEditName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);

  const [customers,     setCustomers]   = useState([]);
  const [transactions,  setTransactions]= useState([]);
  const [employees,     setEmployees]   = useState([]);
  const [loading,       setLoading]     = useState(true);

  // Search / filter / sort
  const [searchTerm,   setSearchTerm]   = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [sortType,     setSortType]     = useState("recent");

  // Pending state inside modal (committed on "View Results")
  const [pendingFilter, setPendingFilter] = useState("all");
  const [pendingSort,   setPendingSort]   = useState("recent");
  const [showFilter,    setShowFilter]    = useState(false);

  /* ── data loading ── */
  const load = useCallback(async () => {
    setLoading(true);
    const [custRes, txnRes, empRes] = await Promise.all([
      supabase.from("customers").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("customer_id, type, amount, created_at"),
      supabase.from("employees").select("*").order("created_at", { ascending: false }),
    ]);
    setCustomers(custRes.data || []);
    setTransactions(txnRes.data || []);
    setEmployees(empRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();

    const channel = supabase
      .channel("admin-home-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  /* ── balance map (memoised) ── */
  const balanceMap = useMemo(() => buildBalanceMap(transactions), [transactions]);

  /* ── latest activity per customer ── */
  const lastActivityMap = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      const ts = t.created_at;
      if (ts && (!map[t.customer_id] || new Date(ts) > new Date(map[t.customer_id]))) {
        map[t.customer_id] = ts;
      }
    });
    return map;
  }, [transactions]);

  /* ── totals for SummaryCard ── */
  const summaryTotals = useMemo(() => {
    let youGet = 0, youGive = 0;
    customers.forEach((c) => {
      const bal = balanceMap[c.id] ?? 0;
      if (bal > 0) youGet  += bal;
      else         youGive += Math.abs(bal);
    });
    return { youGet, youGive };
  }, [customers, balanceMap]);

  /* ── filtered + sorted list ── */
  const displayedCustomers = useMemo(
    () => applyFilterAndSort(customers, balanceMap, lastActivityMap, searchTerm, filterType, sortType),
    [customers, balanceMap, lastActivityMap, searchTerm, filterType, sortType]
  );

  /* ── active filter badge count ── */
  const activeFilterCount = (filterType !== "all" ? 1 : 0) + (sortType !== "recent" ? 1 : 0);

  /* ── open modal: sync pending state ── */
  const openFilter = () => {
    setPendingFilter(filterType);
    setPendingSort(sortType);
    setShowFilter(true);
  };

  /* ── apply from modal ── */
  const applyFilter = () => {
    setFilterType(pendingFilter);
    setSortType(pendingSort);
    setShowFilter(false);
  };

  /* ── employee creation ── */
  const createEmployee = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!username || !password) { setMessage("Please enter both username and password."); return; }
    const pseudoEmail = `${username}@example.com`;
    const { data: authData, error } = await supabase.auth.signUp({
      email: pseudoEmail,
      password,
      options: { data: { username } },
    });
    if (error) { setMessage(error.message || "Unable to create employee."); return; }

    const auth_id = authData?.user?.id || null;

    sessionStorage.setItem("temp_employee", JSON.stringify({
      username,
      password,
      auth_id,
      created_at: new Date().toISOString(),
    }));

    navigate("/admin/employees/setup");
  };

  const handleEditBusinessName = () => {
    setEditName(businessName);
    setShowNameModal(true);
  };

  const saveBusinessName = () => {
    const name = editName.trim() || "Shiv Shankar Dairy";
    localStorage.setItem("khata_business_name", name);
    setBusinessName(name);
    setShowNameModal(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="relative z-10 animate-fade-in">
        <Header businessName={businessName} onEdit={handleEditBusinessName} isAdmin={true} />
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={true} />

        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">

          {activeTab === "customers" && (
            <>
              <SummaryCard youGive={summaryTotals.youGive} youGet={summaryTotals.youGet} />

              {/* View Reports */}
              <button
                onClick={() => navigate("/admin/reports")}
                className="w-full py-3 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
              >
                View Reports
              </button>

              {/* Search + Filter */}
              <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onOpenFilter={openFilter}
                activeCount={activeFilterCount}
              />

              {/* Active filter pills (quick context) */}
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
                  <div className="space-y-3 animate-pulse">
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
                    time={lastActivityMap[customer.id] || customer.created_at}
                    balance={balanceMap[customer.id] ?? 0}
                  />
                ))}
              </div>
            </>
          )}

          {activeTab === "catalogue" && (
            <CatalogueView isAdmin={true} />
          )}

          {activeTab === "employees" && (
            <div className="grid gap-6 lg:grid-cols-2 max-w-5xl mx-auto">
              {/* Employee List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">All Employees</h2>
                  <button
                    onClick={() => navigate("/admin/staff")}
                    className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] hover:text-[var(--primary-hover)] transition cursor-pointer outline-none"
                  >
                    Staff Dashboard →
                  </button>
                </div>
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="h-16 bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full" />
                    ))}
                  </div>
                ) : employees.length === 0 ? (
                  <div className="rounded-3xl card py-12 text-center text-[var(--text-secondary)]">
                    <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p className="font-bold text-sm">No employees yet.</p>
                    <p className="text-xs mt-1">Create your first employee using the form.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {employees.map((emp) => (
                      <div
                        key={emp.id}
                        onClick={() => navigate(`/admin/employees/${emp.id}`)}
                        className="card rounded-2xl px-5 py-3.5 flex items-center gap-3 hover:card-hover transition-all duration-200 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-sm shrink-0">
                          {emp.username[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--text-primary)] font-semibold text-sm truncate">{emp.username}</p>
                          <p className="text-[var(--text-muted)] text-[10px] font-medium">
                            Created {new Date(emp.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Create Employee Form */}
              <div className="card rounded-3xl p-6 shadow-md animate-scale-in">
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-5 tracking-tight">Add New Employee</h2>
                <form onSubmit={createEmployee} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Employee Username</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                      placeholder="Enter employee username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Employee Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                      placeholder="Enter employee password"
                    />
                  </div>
                  
                  {message && (
                    <div className={`p-3.5 rounded-2xl text-xs font-semibold border ${
                      message.includes("successfully") 
                        ? "bg-[var(--success-light)] border-[var(--success)]/20 text-[var(--success)]"
                        : "bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]"
                    }`}>
                      {message}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-3.5 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-sm"
                  >
                    Create Employee
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <FloatingButton onClick={() => window.location.href = '/customers/add'} isVisible={activeTab === "customers"} />
      </div>

      {/* Business name edit modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6" onClick={() => setShowNameModal(false)}>
          <div className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Edit Business Name</h2>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm mb-5"
              placeholder="Enter business name"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveBusinessName(); }}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNameModal(false)} className="flex-1 py-3.5 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--surface)] transition cursor-pointer outline-none active:scale-95">
                Cancel
              </button>
              <button onClick={saveBusinessName} className="flex-1 py-3.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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

export default AdminHome;
