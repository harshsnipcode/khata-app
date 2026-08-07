import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { cumulativeDueSalary, calculateMonthSalary, monthlyPayments } from "../lib/salary";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function EmployeeSalarySummary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [employee, setEmployee] = useState(null);
  const [attendanceData, setAttendanceData] = useState({});
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState("month");

  const now = new Date();
  const selectedYear = Number(searchParams.get("year")) || now.getFullYear();
  const rawMonth = Number(searchParams.get("month"));
  const selectedMonth = rawMonth >= 1 && rawMonth <= 12 ? rawMonth - 1 : now.getMonth();

  const loadPayments = useCallback(async () => {
    const { data: pays } = await supabase
      .from("salary_payments")
      .select("*")
      .eq("employee_id", id)
      .order("payment_date", { ascending: false });
    setPayments(pays || []);
  }, [id]);

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await supabase.from("employees").select("*").eq("id", id).single();
      setEmployee(emp);

      if (emp) {
        const { data: att } = await supabase.from("employee_attendance").select("*").eq("employee_id", id);
        const map = {};
        (att || []).forEach((a) => { map[a.date] = a.status; });
        setAttendanceData(map);
      }

      await loadPayments();
      setLoading(false);
    };
    load();
  }, [id, loadPayments]);

  useEffect(() => {
    const channel = supabase
      .channel(`salary-summary-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_payments", filter: `employee_id=eq.${id}` }, () => loadPayments())
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_attendance", filter: `employee_id=eq.${id}` }, () => {
        supabase.from("employee_attendance").select("*").eq("employee_id", id).then(({ data }) => {
          const map = {};
          (data || []).forEach((a) => { map[a.date] = a.status; });
          setAttendanceData(map);
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, loadPayments]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Employee not found.</div>
      </div>
    );
  }

  const monthSalary = calculateMonthSalary(employee, attendanceData, selectedYear, selectedMonth);
  const globalEarned = cumulativeDueSalary(employee, attendanceData);
  const globalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const currentDue = globalEarned - globalPayments;
  const monthPayments = monthlyPayments(payments, selectedYear, selectedMonth);
  const totalPayments = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const visiblePayments = paymentFilter === "all" ? payments : monthPayments;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate(`/admin/employees/${id}`)}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          {employee.username}
        </button>

        {/* Employee Info */}
        <div className="card rounded-3xl p-6 shadow-md flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
            {employee.username[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1">
            <p className="text-[var(--text-primary)] font-bold text-lg">{employee.username}</p>
            <p className="text-[var(--text-muted)] text-xs font-medium">Salary Summary — {MONTHS[selectedMonth]} {selectedYear}</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--primary-light)] text-[var(--primary)] shrink-0">
            {MONTHS[selectedMonth]} {selectedYear}
          </span>
        </div>

        {/* Salary Overview */}
        {employee.attendance_enabled ? (
          <div className="card rounded-3xl p-6 shadow-md">
            <h2 className="text-[var(--text-primary)] font-bold text-base mb-4">Salary Overview</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Monthly Salary</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  ₹{Number(employee.salary_amount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Present Days</span>
                <span className="text-sm font-bold text-[#2d6a4f]">{monthSalary.present}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Absent Days</span>
                <span className="text-sm font-bold text-[#e76f51]">{monthSalary.absent}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Paid Leave</span>
                <span className="text-sm font-bold text-[#636e72]">{monthSalary.paidLeave}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Half Days</span>
                <span className="text-sm font-bold text-[#b45309]">{monthSalary.halfDay}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Salary Earned</span>
                <span className="text-sm font-bold text-[var(--primary)]">₹{Math.round(monthSalary.payableSalary).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Total Payments Made</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">₹{Math.round(totalPayments).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Current Due</span>
                <span className="text-sm font-bold text-[var(--primary)]">₹{Math.max(0, Math.round(currentDue)).toLocaleString()}</span>
              </div>
              {currentDue < 0 && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--text-secondary)] font-medium">Remaining Balance</span>
                  <span className="text-sm font-bold text-[#2d6a4f]">₹{Math.abs(Math.round(currentDue)).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card rounded-3xl p-6 shadow-md">
            <p className="text-[var(--text-secondary)] text-sm font-medium">Attendance & salary tracking is not enabled for this employee.</p>
          </div>
        )}

        {/* Payment History */}
        {employee.attendance_enabled && (
          <div className="card rounded-3xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[var(--text-primary)] font-bold text-base">Payment History</h2>
              <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
                <button
                  onClick={() => setPaymentFilter("month")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer outline-none ${
                    paymentFilter === "month"
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--primary)]"
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setPaymentFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer outline-none ${
                    paymentFilter === "all"
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--primary)]"
                  }`}
                >
                  All
                </button>
              </div>
            </div>
            {visiblePayments.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm font-medium">
                {paymentFilter === "all"
                  ? "No payments recorded yet."
                  : `No payments in ${MONTHS[selectedMonth]} ${selectedYear}.`}
              </p>
            ) : (
              <div className="space-y-3">
                {visiblePayments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/admin/employees/${id}/payment/${p.id}`)}
                    className="w-full flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 transition hover:border-[var(--primary)] active:scale-[0.99] cursor-pointer outline-none text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">
                        {new Date(p.payment_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {p.notes && (
                        <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5 truncate">{p.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">₹{Math.round(Number(p.amount)).toLocaleString()}</p>
                      <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmployeeSalarySummary;
