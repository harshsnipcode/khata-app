import assert from "node:assert/strict";
import test from "node:test";

import {
  attendanceFactor,
  cumulativeDueSalary,
  calculateMonthSalary,
  getDaysInMonth,
  monthlyPayments,
} from "../src/lib/salary.js";

test("attendanceFactor maps each status to a daily factor", () => {
  assert.equal(attendanceFactor("absent"), 0);
  assert.equal(attendanceFactor("half_day"), 0.5);
  assert.equal(attendanceFactor("present"), 1);
  assert.equal(attendanceFactor("paid_leave"), 1);
  assert.equal(attendanceFactor(undefined), 1);
});

test("getDaysInMonth returns correct day counts", () => {
  assert.equal(getDaysInMonth(2026, 1), 28);
  assert.equal(getDaysInMonth(2026, 7), 31);
  assert.equal(getDaysInMonth(2026, 8), 30);
});

function jan2020Map() {
  const map = {};
  for (let day = 1; day <= 31; day++) {
    const key = `2020-01-${String(day).padStart(2, "0")}`;
    if (day === 21) map[key] = "absent";
    else if (day === 22) map[key] = "half_day";
    else if (day === 23) map[key] = "paid_leave";
    else map[key] = "present";
  }
  return map;
}

test("calculateMonthSalary counts half days and pays 50% of a day", () => {
  const employee = {
    attendance_enabled: true,
    salary_type: "monthly",
    salary_amount: 15000,
  };
  const result = calculateMonthSalary(employee, jan2020Map(), 2020, 0);
  assert.equal(result.present, 28);
  assert.equal(result.absent, 1);
  assert.equal(result.paidLeave, 1);
  assert.equal(result.halfDay, 1);
  assert.equal(result.worked, 29.5);
  assert.equal(result.totalSalary, 15000);
  assert.equal(Math.round(result.payableSalary), Math.round((29.5 * 15000) / 31));
});

test("calculateMonthSalary daily salary pays half amount for a half day", () => {
  const employee = {
    attendance_enabled: true,
    salary_type: "daily",
    salary_amount: 1000,
  };
  const result = calculateMonthSalary(employee, jan2020Map(), 2020, 0);
  assert.equal(result.present, 28);
  assert.equal(result.halfDay, 1);
  assert.equal(result.payableSalary, 29500);
  assert.equal(result.totalSalary, 29500);
});

test("cumulativeDueSalary credits half days and excludes absences", () => {
  const start = new Date();
  start.setDate(start.getDate() - 9);

  const map = {};
  const d = new Date(start.toISOString().split("T")[0]);
  for (let i = 0; i < 10; i++) {
    const key = d.toISOString().split("T")[0];
    if (i === 3) map[key] = "half_day";
    else if (i === 5) map[key] = "absent";
    d.setDate(d.getDate() + 1);
  }

  const employee = {
    attendance_enabled: true,
    salary_start_date: start.toISOString().split("T")[0],
    salary_type: "daily",
    salary_amount: 1000,
  };
  assert.equal(cumulativeDueSalary(employee, map), 8500);
});

test("cumulativeDueSalary returns 0 when attendance is disabled or no start date", () => {
  const employee = { attendance_enabled: false, salary_amount: 1000 };
  assert.equal(cumulativeDueSalary(employee, {}), 0);
  assert.equal(cumulativeDueSalary({ ...employee, attendance_enabled: true }, {}), 0);
});

test("monthlyPayments filters payments to the selected month", () => {
  const pays = [
    { payment_date: "2026-08-01", amount: 100 },
    { payment_date: "2026-08-31", amount: 200 },
    { payment_date: "2026-07-31", amount: 300 },
    { payment_date: null, amount: 400 },
  ];
  const august = monthlyPayments(pays, 2026, 7);
  assert.equal(august.length, 2);
  assert.equal(august.reduce((sum, p) => sum + p.amount, 0), 300);
  assert.equal(monthlyPayments(pays, 2026, 5).length, 0);
});
