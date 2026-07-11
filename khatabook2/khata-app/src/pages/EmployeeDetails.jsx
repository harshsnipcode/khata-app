import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";

const PERMISSION_LABELS = {
  1: "View Entries & Send Reminders",
  2: "Add & View Entries/Parties",
  3: "Add, View, Edit, Delete: Entries/Parties",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthDateRange(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month, getDaysInMonth(year, month));
  return { start, end };
}

function isOnOrBeforeToday(d) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d <= today;
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

function calculateSalary(employee, attendanceMap, year, month) {
  if (!employee.attendance_enabled) return { totalSalary: 0, payableSalary: 0, present: 0, absent: 0, paidLeave: 0 };

  const daysInMonth = getDaysInMonth(year, month);
  const amount = Number(employee.salary_amount) || 0;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let present = 0, absent = 0, paidLeave = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    if (dateObj > today) continue;

    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const status = attendanceMap[key];
    if (status === "absent") absent++;
    else if (status === "paid_leave") paidLeave++;
    else present++;
  }

  if (employee.salary_type === "monthly") {
    const perDay = amount / daysInMonth;
    return { totalSalary: amount, payableSalary: (present + paidLeave) * perDay, present, absent, paidLeave };
  } else {
    const payable = (present + paidLeave) * amount;
    return { totalSalary: payable, payableSalary: payable, present, absent, paidLeave };
  }
}

function EmployeeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  const [selectedDate, setSelectedDate] = useState(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [payments, setPayments] = useState([]);

  const loadEmployee = useCallback(async () => {
    const { data } = await supabase.from("employees").select("*").eq("id", id).single();
    setEmployee(data);
  }, [id]);

  const loadAttendance = useCallback(async () => {
    const { start, end } = getMonthDateRange(currentYear, currentMonth);
    const { data } = await supabase
      .from("employee_attendance")
      .select("*")
      .eq("employee_id", id)
      .gte("date", start.toISOString().split("T")[0])
      .lte("date", end.toISOString().split("T")[0]);
    setAttendance(data || []);
  }, [id, currentYear, currentMonth]);

  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from("salary_payments")
      .select("amount")
      .eq("employee_id", id);
    setPayments(data || []);
  }, [id]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadEmployee(), loadAttendance(), loadPayments()]);
      setLoading(false);
    };
    init();
  }, [loadEmployee, loadAttendance, loadPayments]);

  useEffect(() => {
    const channel = supabase
      .channel(`employee-details-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_attendance", filter: `employee_id=eq.${id}` }, () => loadAttendance())
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_payments", filter: `employee_id=eq.${id}` }, () => loadPayments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, loadAttendance, loadPayments]);

  const attendanceMap = {};
  attendance.forEach((a) => {
    attendanceMap[a.date] = a.status;
  });

  const cumulativeDue = employee ? cumulativeDueSalary(employee, attendanceMap) : 0;
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const adjustedDue = cumulativeDue - totalPayments;
  const salaryData = employee
    ? calculateSalary(employee, attendanceMap, currentYear, currentMonth)
    : { totalSalary: 0, payableSalary: 0, present: 0, absent: 0, paidLeave: 0 };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const startDate = employee?.salary_start_date ? new Date(employee.salary_start_date) : null;

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const handleDateClick = (day) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate({ day, dateStr, label: `${day} ${MONTHS[currentMonth]}` });
    setShowAttendanceModal(true);
  };

  const handleMarkAttendance = async (status) => {
    if (!selectedDate) return;
    const { dateStr } = selectedDate;

    const existing = attendance.find((a) => a.date === dateStr);

     if (status === "present") {
       if (existing) {
         await offlineSupabase.from("employee_attendance").delete({ id: existing.id }).eq("id", existing.id);
       }
     } else {
       if (existing) {
         await offlineSupabase.from("employee_attendance").update({ status }).eq("id", existing.id);
       } else {
         await offlineSupabase.from("employee_attendance").insert([
           { employee_id: id, date: dateStr, status },
         ]);
       }
     }

    setShowAttendanceModal(false);
    setSelectedDate(null);
    await loadAttendance();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (employee.auth_id) {
        await supabase.auth.admin.deleteUser(employee.auth_id);
      }
      await offlineSupabase.from("salary_payments").delete({ id }).eq("employee_id", id);
      await offlineSupabase.from("employee_attendance").delete({ id }).eq("employee_id", id);
      await offlineSupabase.from("employees").delete({ id }).eq("id", id);
      navigate("/admin/staff", { replace: true });
    } catch (err) {
      console.error("Delete failed", err);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const nowDate = new Date();

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

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <button
          onClick={() => navigate("/admin/home")}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          <span
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/employees/${id}/edit`); }}
            className="hover:text-[var(--primary)] transition cursor-pointer"
          >
            {employee.username}
          </span>
        </button>

        {/* Employee Info Card */}
        <div className="card rounded-3xl p-6 shadow-md">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
              {employee.username[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1">
              <p
                onClick={() => navigate(`/admin/employees/${id}/edit`)}
                className="text-[var(--text-primary)] font-bold text-lg hover:text-[var(--primary)] transition cursor-pointer"
              >
                {employee.username}
              </p>
              <p className="text-[var(--text-muted)] text-xs font-medium">
                Created {new Date(employee.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
              </p>
            </div>
            <button
              onClick={() => navigate(`/admin/employees/${id}/summary`)}
              className="px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-wider hover:border-[var(--primary)] hover:text-[var(--primary)] transition cursor-pointer outline-none"
            >
              Summary
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Permissions</p>
              <p className="text-[var(--text-primary)] text-sm font-semibold">
                {employee.permissions_enabled
                  ? PERMISSION_LABELS[employee.permission_level] || `Level ${employee.permission_level}`
                  : "Default"}
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">
                {employee.attendance_enabled && employee.salary_type === "daily" ? "Daily Salary" : "Monthly Salary"}
              </p>
              <p className="text-[var(--text-primary)] text-sm font-semibold">
                {employee.attendance_enabled ? `₹${Number(employee.salary_amount).toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Salary Type</p>
              <p className="text-[var(--text-primary)] text-sm font-semibold capitalize">
                {employee.attendance_enabled ? employee.salary_type : "—"}
              </p>
            </div>
            <div className="bg-[var(--primary-light)] border border-[var(--primary)]/20 rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Total Due</p>
              <p className="text-[var(--primary)] text-lg font-bold">₹{Math.max(0, Math.round(adjustedDue)).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Attendance Calendar */}
        <div className="card rounded-3xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[var(--text-primary)] font-bold text-base">Attendance — {MONTHS[currentMonth]} {currentYear}</h2>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-[var(--primary-light)] transition cursor-pointer outline-none text-[var(--text-secondary)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="text-sm font-bold text-[var(--text-primary)] w-28 text-center">{MONTHS[currentMonth]} {currentYear}</span>
              <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-[var(--primary-light)] transition cursor-pointer outline-none text-[var(--text-secondary)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-[var(--text-muted)] uppercase py-2">{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

              const dateObj = new Date(currentYear, currentMonth, day);
              const isPastOrToday = isOnOrBeforeToday(dateObj);
              const afterStart = startDate ? dateObj >= new Date(startDate.toISOString().split("T")[0]) : true;

              const explicitStatus = attendanceMap[dateStr];
              const isDefaultPresent = isPastOrToday && afterStart && !explicitStatus && employee.attendance_enabled;

              const isToday = nowDate.getFullYear() === currentYear && nowDate.getMonth() === currentMonth && nowDate.getDate() === day;

              let bg = "";
              if (explicitStatus === "absent") bg = "bg-[#fde8e2] text-[#e76f51]";
              else if (explicitStatus === "paid_leave") bg = "bg-[#e9ecef] text-[#636e72]";
              else if (explicitStatus === "present" || isDefaultPresent) bg = "bg-[#d8f3e3] text-[#2d6a4f]";

              return (
                <button
                  key={day}
                  onClick={() => handleDateClick(day)}
                  className={`aspect-square rounded-xl text-xs font-bold flex items-center justify-center transition-all duration-200 cursor-pointer outline-none relative ${
                    bg || "text-[var(--text-primary)] hover:bg-[var(--primary-light)]"
                  } ${isToday ? "ring-2 ring-[var(--primary)]" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2d6a4f]" />
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e76f51]" />
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Absent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#636e72]" />
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Paid Leave</span>
            </div>
          </div>
        </div>

        {/* Monthly Summary */}
        {employee.attendance_enabled && (
          <div className="card rounded-3xl p-6 shadow-md">
            <p className="text-[var(--text-primary)] font-bold text-base mb-4">
              01 {MONTHS[currentMonth]} {currentYear} — {daysInMonth} {MONTHS[currentMonth]} {currentYear}
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Total Salary</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  ₹{employee.salary_type === "monthly"
                    ? Math.round(Number(employee.salary_amount)).toLocaleString()
                    : Math.round(salaryData.totalSalary).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Payable Salary</span>
                <span className="text-sm font-bold text-[var(--primary)]">₹{Math.round(salaryData.payableSalary).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Present</span>
                <span className="text-sm font-bold text-[#2d6a4f]">{salaryData.present}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Absent</span>
                <span className="text-sm font-bold text-[#e76f51]">{salaryData.absent}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[var(--text-secondary)] font-medium">Paid Leave</span>
                <span className="text-sm font-bold text-[#636e72]">{salaryData.paidLeave}</span>
              </div>
            </div>
          </div>
        )}

        {/* Add Payment */}
        {employee.attendance_enabled && (
          <div>
            <button
              onClick={() => navigate(`/admin/employees/${id}/payment`)}
              className="w-full py-3.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
            >
              Add Payment
            </button>
          </div>
        )}

        {/* Delete Employee */}
        <div className="pt-4">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-3.5 rounded-2xl border border-[var(--danger)]/30 text-[var(--danger)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--danger-light)] transition cursor-pointer outline-none active:scale-95"
          >
            Delete Employee
          </button>
        </div>
      </div>

      {/* Attendance Modal */}
      {showAttendanceModal && selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowAttendanceModal(false)}
        >
          <div
            className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Mark Attendance</h2>
            <p className="text-[var(--text-muted)] text-sm font-medium mb-5">{selectedDate.label}</p>
            <div className="space-y-3">
              {[
                { value: "present", label: "Present", color: "text-[#2d6a4f]", borderColor: "border-[#2d6a4f]" },
                { value: "absent", label: "Absent", color: "text-[#e76f51]", borderColor: "border-[#e76f51]" },
                { value: "paid_leave", label: "Paid Leave", color: "text-[#636e72]", borderColor: "border-[#636e72]" },
              ].map((opt) => {
                const explicitStatus = attendanceMap[selectedDate.dateStr];
                const isDefaultPresent = !explicitStatus;
                const isActive = opt.value === "present" ? isDefaultPresent || explicitStatus === "present" : explicitStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleMarkAttendance(opt.value)}
                    className={`w-full py-4 rounded-2xl border-2 font-bold text-sm transition-all duration-200 cursor-pointer outline-none ${
                      isActive
                        ? `${opt.borderColor} ${opt.color} bg-opacity-10`
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowAttendanceModal(false)}
              className="w-full mt-4 py-3 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--surface)] transition cursor-pointer outline-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Are you sure?</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              This will permanently delete:<br />
              - Employee account<br />
              - Login credentials<br />
              - Attendance records<br />
              - Salary records<br />
              - Permissions
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3.5 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--surface)] transition cursor-pointer outline-none active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3.5 rounded-2xl bg-[var(--danger)] hover:bg-[#d45a3d] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeDetails;
