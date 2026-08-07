// Single source of truth for employee salary & attendance calculations.
// Pages must import these helpers instead of duplicating logic.

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function isOnOrBeforeToday(d) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d <= today;
}

export function getMonthDateRange(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month, getDaysInMonth(year, month));
  return { start, end };
}

// present / paid_leave / unmarked (default present) = full day
// half_day = half day, absent = zero.
export function attendanceFactor(status) {
  if (status === "absent") return 0;
  if (status === "half_day") return 0.5;
  return 1;
}

export function perDayRate(employee, year, month) {
  const amount = Number(employee.salary_amount) || 0;
  if (employee.salary_type === "monthly") return amount / getDaysInMonth(year, month);
  return amount;
}

// Outstanding salary earned from salary_start_date to today (global).
export function cumulativeDueSalary(employee, attendanceMap) {
  if (!employee.attendance_enabled || !employee.salary_start_date) return 0;

  const start = new Date(employee.salary_start_date);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (start > today) return 0;

  const rate = perDayRate(employee, today.getFullYear(), today.getMonth());
  let due = 0;
  let d = new Date(start);
  while (d <= today) {
    const key = d.toISOString().split("T")[0];
    due += attendanceFactor(attendanceMap[key]) * rate;
    d.setDate(d.getDate() + 1);
  }
  return due;
}

// Month-specific attendance stats and payable salary.
export function calculateMonthSalary(employee, attendanceMap, year, month) {
  const empty = { totalSalary: 0, payableSalary: 0, present: 0, absent: 0, paidLeave: 0, halfDay: 0, worked: 0 };
  if (!employee.attendance_enabled) return empty;

  const daysInMonth = getDaysInMonth(year, month);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let present = 0, absent = 0, paidLeave = 0, halfDay = 0, worked = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    if (dateObj > today) continue;

    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const status = attendanceMap[key];
    if (status === "absent") absent++;
    else if (status === "paid_leave") { paidLeave++; worked += 1; }
    else if (status === "half_day") { halfDay++; worked += 0.5; }
    else { present++; worked += 1; }
  }

  const rate = perDayRate(employee, year, month);
  const payableSalary = worked * rate;

  if (employee.salary_type === "monthly") {
    return { totalSalary: Number(employee.salary_amount) || 0, payableSalary, present, absent, paidLeave, halfDay, worked };
  }
  return { totalSalary: payableSalary, payableSalary, present, absent, paidLeave, halfDay, worked };
}

export function monthlyPayments(payments, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return (payments || []).filter((p) => String(p.payment_date || "").startsWith(prefix));
}
