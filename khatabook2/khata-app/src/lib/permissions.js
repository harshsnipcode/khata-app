import { showToast } from "./offline/toast";

const ACTIONS_BY_LEVEL = {
  1: [
    "view_customers",
    "view_customer_details",
    "view_transactions",
    "send_reminders",
    "search",
    "filter",
    "view_reports",
  ],
  2: [
    "view_customers",
    "view_customer_details",
    "view_transactions",
    "send_reminders",
    "search",
    "filter",
    "view_reports",
    "add_customer",
    "add_transaction",
    "add_product",
    "stock_entry",
    "excel_access",
  ],
  3: [
    "view_customers",
    "view_customer_details",
    "view_transactions",
    "send_reminders",
    "search",
    "filter",
    "view_reports",
    "add_customer",
    "add_transaction",
    "add_product",
    "stock_entry",
    "excel_access",
    "edit_customer",
    "delete_customer",
    "edit_transaction",
    "delete_transaction",
    "edit_product",
    "delete_product",
  ],
};

function getPermissionLevel() {
  try {
    const role = localStorage.getItem("khata_role");
    if (role === "admin") return 3;
    if (role !== "employee") return 0;
    return Number(localStorage.getItem("khata_permission_level")) || 1;
  } catch {
    return 0;
  }
}

export function can(action) {
  const level = getPermissionLevel();
  const allowed = ACTIONS_BY_LEVEL[level];
  if (!allowed) return false;
  return allowed.includes(action);
}

export function requirePermission(action) {
  if (can(action)) return true;
  showToast("Permission denied. Contact the administrator.", "error", 4000);
  return false;
}

export function requireAdmin() {
  try {
    return localStorage.getItem("khata_role") === "admin";
  } catch {
    return false;
  }
}
