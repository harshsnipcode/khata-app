import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import FloatingButton from "../components/FloatingButton";

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function calcEmployeeSalary(employee, attendanceMap, year, month) {
  if (!employee.attendance_enabled) return { payableSalary: 0, present: 0, absent: 0, paidLeave: 0 };

  const daysInMonth = getDaysInMonth(year, month);
  const amount = Number(employee.salary_amount) || 0;

  let present = 0, absent = 0, paidLeave = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const status = attendanceMap[key];
    if (status === "absent") absent++;
    else if (status === "paid_leave") paidLeave++;
    else present++;
  }

  if (employee.salary_type === "monthly") {
    const perDay = amount / daysInMonth;
    return { payableSalary: (present + paidLeave) * perDay, present, absent, paidLeave };
  } else {
    return { payableSalary: (present + paidLeave) * amount, present, absent, paidLeave };
  }
}

function cumulativeDue(employee, attendanceMap) {
  if (!employee.attendance_enabled || !employee.salary_start_date) return 0;
  const start = new Date(employee.salary_start_date);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (start > today) return 0;

  const amount = Number(employee.salary_amount) || 0;
  const now = new Date();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());

  if (employee.salary_type === "daily") {
    let due = 0;
    let d = new Date(start);
    while (d <= today) {
      const key = d.toISOString().split("T")[0];
      const status = attendanceMap[key];
      if (status !== "absent") due += amount;
      d.setDate(d.getDate() + 1);
    }
    return due;
  } else {
    const perDay = amount / daysInMonth;
    let worked = 0;
    let d = new Date(start);
    while (d <= today) {
      const key = d.toISOString().split("T")[0];
      const status = attendanceMap[key];
      if (status !== "absent") worked++;
      d.setDate(d.getDate() + 1);
    }
    return worked * perDay;
  }
}

const PERMISSION_SHORT = { 1: "View", 2: "Party", 3: "Full" };

function StaffDashboard() {
  const navigate = useNavigate();

  const now = new Date();
  const [currentMonth] = useState(now.getMonth());
  const [currentYear] = useState(now.getFullYear());

  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [todayAttendance, setTodayAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sortBy, setSortBy] = useState("recent");

  const [businessName, setBusinessName] = useState(() => localStorage.getItem("khata_business_name") || "My Business");
  const [editName, setEditName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const loadData = useCallback(async () => {
    const { data: emps } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    setEmployees(emps || []);

    const { start, end } = {
      start: new Date(currentYear, currentMonth, 1),
      end: new Date(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth)),
    };

    const { data: att } = await supabase
      .from("employee_attendance")
      .select("*")
      .gte("date", start.toISOString().split("T")[0])
      .lte("date", end.toISOString().split("T")[0]);

    const map = {};
    const todayMap = {};
    (att || []).forEach((a) => {
      if (!map[a.employee_id]) map[a.employee_id] = {};
      map[a.employee_id][a.date] = a.status;
      if (a.date === todayStr) todayMap[a.employee_id] = a.status;
    });
    setAttendanceData(map);
    setTodayAttendance(todayMap);
    setLoading(false);
  }, [currentYear, currentMonth, todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("staff-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_attendance" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  const employeeSalaries = useMemo(() => {
    return employees.map((emp) => ({
      ...emp,
      salaryCalc: calcEmployeeSalary(emp, attendanceData[emp.id] || {}, currentYear, currentMonth),
      cumulativeDue: cumulativeDue(emp, attendanceData[emp.id] || {}),
    }));
  }, [employees, attendanceData, currentYear, currentMonth]);

  const totalDue = useMemo(() => {
    return employeeSalaries.reduce((sum, emp) => sum + (emp.cumulativeDue || 0), 0);
  }, [employeeSalaries]);

  const todayStats = useMemo(() => {
    let present = 0, absent = 0, paidLeave = 0;
    Object.values(todayAttendance).forEach((status) => {
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else if (status === "paid_leave") paidLeave++;
    });
    return { present, absent, paidLeave };
  }, [todayAttendance]);

  const filteredEmployees = useMemo(() => {
    let list = [...employeeSalaries];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((e) => e.username.toLowerCase().includes(term));
    }

    if (filterType === "monthly") list = list.filter((e) => e.salary_type === "monthly" && e.attendance_enabled);
    else if (filterType === "daily") list = list.filter((e) => e.salary_type === "daily" && e.attendance_enabled);

    list.sort((a, b) => {
      if (sortBy === "name") return a.username.localeCompare(b.username);
      if (sortBy === "salary_high") return (b.cumulativeDue || 0) - (a.cumulativeDue || 0);
      if (sortBy === "salary_low") return (a.cumulativeDue || 0) - (b.cumulativeDue || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return list;
  }, [employeeSalaries, searchTerm, filterType, sortBy]);

  const handleQuickAttendance = async (employeeId, status) => {
    if (status === "present") {
      const existing = await offlineSupabase
        .from("employee_attendance")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date", todayStr)
        .maybeSingle();
      if (existing.data) {
        await offlineSupabase.from("employee_attendance").delete({ id: existing.data.id }).eq("id", existing.data.id);
      }
    } else {
      const existing = await offlineSupabase
        .from("employee_attendance")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date", todayStr)
        .maybeSingle();
      if (existing.data) {
        await offlineSupabase.from("employee_attendance").update({ status }).eq("id", existing.data.id);
      } else {
        await offlineSupabase.from("employee_attendance").insert([{ employee_id: employeeId, date: todayStr, status }]);
      }
    }
    await loadData();
  };

  const handleEditBusinessName = () => {
    setEditName(businessName);
    setShowNameModal(true);
  };

  const saveBusinessName = () => {
    const name = editName.trim() || "My Business";
    localStorage.setItem("khata_business_name", name);
    setBusinessName(name);
    setShowNameModal(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="relative z-10 animate-fade-in">
        <Header businessName={businessName} onEdit={handleEditBusinessName} isAdmin={true} />
        <Navbar activeTab="employees" setActiveTab={() => {}} isAdmin={true} />

        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* Top Summary Card */}
          <div className="card rounded-3xl p-6 shadow-md">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Total Due Salary</p>
                <p className="text-[var(--primary)] text-3xl font-bold">₹{Math.round(totalDue).toLocaleString()}</p>
                <p className="text-[var(--text-muted)] text-xs font-medium mt-1">for {employees.length} staff</p>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2">Today's Attendance</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2d6a4f]" />
                    <span className="font-semibold text-[var(--text-primary)]">{todayStats.present}</span>
                    <span className="text-[var(--text-muted)] text-[10px]">Present</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e76f51]" />
                    <span className="font-semibold text-[var(--text-primary)]">{todayStats.absent}</span>
                    <span className="text-[var(--text-muted)] text-[10px]">Absent</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#636e72]" />
                    <span className="font-semibold text-[var(--text-primary)]">{todayStats.paidLeave}</span>
                    <span className="text-[var(--text-muted)] text-[10px]">Leave</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-11 pr-5 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                placeholder="Search Staff"
              />
            </div>
            <button
              onClick={() => setShowFilterModal(true)}
              className="p-3 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface)] transition cursor-pointer outline-none"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex gap-2">
            {["all", "monthly", "daily"].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer outline-none ${
                  filterType === f
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                }`}
              >
                {f === "all" ? "All" : f === "monthly" ? "Monthly" : "Daily"}
              </button>
            ))}
          </div>

          {/* Employee Cards */}
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 bg-[var(--surface)] border border-[var(--border)] rounded-3xl w-full" />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
              <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <p className="font-bold text-sm">No staff found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEmployees.map((emp) => (
                <div
                  key={emp.id}
                  onClick={() => navigate(`/admin/employees/${emp.id}`)}
                  className="card rounded-3xl p-5 shadow-md hover:card-hover transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-lg shrink-0">
                      {emp.username[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[var(--text-primary)] font-bold text-base truncate">{emp.username}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--primary-light)] text-[var(--primary)] shrink-0">
                          {emp.attendance_enabled ? (emp.salary_type === "daily" ? "Daily" : "Monthly") : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">
                          Due: <span className="font-bold text-[var(--primary)]">₹{Math.round(emp.cumulativeDue || 0).toLocaleString()}</span>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] font-medium">
                          {emp.permissions_enabled ? PERMISSION_SHORT[emp.permission_level] || "Custom" : "Default"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">Today:</span>
                        <select
                          value={todayAttendance[emp.id] || ""}
                          onChange={(e) => e.target.value && handleQuickAttendance(emp.id, e.target.value)}
                          className="text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer outline-none"
                        >
                          <option value="">Present</option>
                          <option value="absent">Absent</option>
                          <option value="paid_leave">Paid Leave</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <FloatingButton
          onClick={() => navigate("/admin/staff/new")}
          isVisible={true}
          label="+ Add Employee"
        />

        {/* Filter Modal */}
        {showFilterModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
            onClick={() => setShowFilterModal(false)}
          >
            <div
              className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Filter & Sort</h2>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2">Filter By</p>
                  <div className="space-y-2">
                    {["all", "monthly", "daily"].map((f) => (
                      <label
                        key={f}
                        onClick={() => setFilterType(f)}
                        className={`block p-3 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                          filterType === f
                            ? "border-[var(--primary)] bg-[var(--primary-light)]"
                            : "border-[var(--border)] hover:border-[var(--border-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            filterType === f ? "border-[var(--primary)]" : "border-[var(--border)]"
                          }`}>
                            {filterType === f && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)] capitalize">{f === "all" ? "All" : f}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2">Sort By</p>
                  <div className="space-y-2">
                    {[
                      { value: "recent", label: "Recently Added" },
                      { value: "name", label: "By Name (A-Z)" },
                      { value: "salary_high", label: "Salary Due (High → Low)" },
                      { value: "salary_low", label: "Salary Due (Low → High)" },
                    ].map((s) => (
                      <label
                        key={s.value}
                        onClick={() => setSortBy(s.value)}
                        className={`block p-3 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                          sortBy === s.value
                            ? "border-[var(--primary)] bg-[var(--primary-light)]"
                            : "border-[var(--border)] hover:border-[var(--border-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            sortBy === s.value ? "border-[var(--primary)]" : "border-[var(--border)]"
                          }`}>
                            {sortBy === s.value && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{s.label}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowFilterModal(false)}
                className="w-full mt-5 py-3.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}

export default StaffDashboard;
