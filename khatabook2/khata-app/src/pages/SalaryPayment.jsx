import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
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

function SalaryPayment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [attendanceData, setAttendanceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const [payments, setPayments] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await supabase.from("employees").select("*").eq("id", id).single();
      setEmployee(emp);

      if (emp) {
        const { data: att } = await supabase.from("employee_attendance").select("*").eq("employee_id", id);
        const map = {};
        (att || []).forEach((a) => { map[a.date] = a.status; });
        setAttendanceData(map);

        const { data: pays } = await supabase.from("salary_payments").select("amount").eq("employee_id", id);
        setPayments(pays || []);
      }

      setLoading(false);
    };
    load();
  }, [id]);

  const cumulativeDue = employee ? cumulativeDueSalary(employee, attendanceData) : 0;
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remainingDue = cumulativeDue - totalPayments;

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }
    if (!paymentDate) {
      setError("Please select a payment date");
      return;
    }

    setSaving(true);
    setError("");

    const { error: saveError } = await offlineSupabase.from("salary_payments").insert([{
      employee_id: id,
      amount: Number(amount),
      notes,
      payment_date: paymentDate,
    }]);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    navigate(`/admin/employees/${id}`, { replace: true });
  };

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

        {/* Employee Info Card */}
        <div className="card rounded-3xl p-6 shadow-md flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
            {employee.username[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-[var(--text-primary)] font-bold text-lg">{employee.username}</p>
            <p className="text-[var(--text-muted)] text-xs font-medium">Add Salary Payment</p>
          </div>
        </div>

        {/* Due Summary */}
        <div className="card rounded-3xl p-6 shadow-md">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Salary Due</p>
              <p className="text-[var(--text-primary)] text-lg font-bold">₹{Math.round(cumulativeDue).toLocaleString()}</p>
            </div>
            <div className="bg-[var(--primary-light)] border border-[var(--primary)]/20 rounded-2xl p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">Remaining Due</p>
              <p className="text-[var(--primary)] text-lg font-bold">₹{Math.max(0, Math.round(remainingDue)).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="card rounded-3xl p-6 shadow-md space-y-5">
          <h2 className="text-[var(--text-primary)] font-bold text-base">Payment Details</h2>

          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] font-bold text-sm">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="15000"
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-10 pr-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this payment"
              rows={3}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm resize-none"
            />
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl text-xs font-semibold border bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SalaryPayment;
