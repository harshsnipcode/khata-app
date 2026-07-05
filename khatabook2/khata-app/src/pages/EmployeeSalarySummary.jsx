import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function cumulativeDueSalary(employee, attendanceMap) {
  if (!employee.attendance_enabled || !employee.salary_start_date) return 0;
  const start = new Date(employee.salary_start_date);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (start > today) return 0;
  const amount = Number(employee.salary_amount) || 0;
  const now = new Date();
  const daysInThisMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
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
    const perDay = amount / daysInThisMonth;
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

function calcPresentDays(employee, attendanceMap) {
  if (!employee.attendance_enabled) return 0;
  const start = employee.salary_start_date ? new Date(employee.salary_start_date) : null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let count = 0;
  let d = start ? new Date(start) : new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= today) {
    const key = d.toISOString().split("T")[0];
    const status = attendanceMap[key];
    if (status !== "absent") count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function calcAbsentDays(employee, attendanceMap) {
  if (!employee.attendance_enabled) return 0;
  const start = employee.salary_start_date ? new Date(employee.salary_start_date) : null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let count = 0;
  let d = start ? new Date(start) : new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= today) {
    const key = d.toISOString().split("T")[0];
    const status = attendanceMap[key];
    if (status === "absent") count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function calcPaidLeaveDays(employee, attendanceMap) {
  if (!employee.attendance_enabled) return 0;
  const start = employee.salary_start_date ? new Date(employee.salary_start_date) : null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let count = 0;
  let d = start ? new Date(start) : new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= today) {
    const key = d.toISOString().split("T")[0];
    const status = attendanceMap[key];
    if (status === "paid_leave") count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function EmployeeSalarySummary() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [attendanceData, setAttendanceData] = useState({});
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await supabase.from("employees").select("*").eq("id", id).single();
      setEmployee(emp);

      if (emp) {
        const { data: att } = await supabase.from("employee_attendance").select("*").eq("employee_id", id);
        const map = {};
        (att || []).forEach((a) => { map[a.date] = a.status; });
        setAttendanceData(map);

        const { data: pays } = await supabase
          .from("salary_payments")
          .select("*")
          .eq("employee_id", id)
          .order("payment_date", { ascending: false });
        setPayments(pays || []);
      }

      setLoading(false);
    };
    load();
  }, [id]);

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

  const salaryEarned = cumulativeDueSalary(employee, attendanceData);
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const currentDue = salaryEarned - totalPayments;
  const presentDays = calcPresentDays(employee, attendanceData);
  const absentDays = calcAbsentDays(employee, attendanceData);
  const paidLeaveDays = calcPaidLeaveDays(employee, attendanceData);

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
          <div>
            <p className="text-[var(--text-primary)] font-bold text-lg">{employee.username}</p>
            <p className="text-[var(--text-muted)] text-xs font-medium">Salary Summary</p>
          </div>
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
                <span className="text-sm font-bold text-[#2d6a4f]">{presentDays}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Absent Days</span>
                <span className="text-sm font-bold text-[#e76f51]">{absentDays}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Paid Leave</span>
                <span className="text-sm font-bold text-[#636e72]">{paidLeaveDays}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Salary Earned</span>
                <span className="text-sm font-bold text-[var(--primary)]">₹{Math.round(salaryEarned).toLocaleString()}</span>
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
            <h2 className="text-[var(--text-primary)] font-bold text-base mb-4">Payment History</h2>
            {payments.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm font-medium">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4"
                  >
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">
                        {new Date(p.payment_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {p.notes && (
                        <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">{p.notes}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">₹{Math.round(Number(p.amount)).toLocaleString()}</p>
                  </div>
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
