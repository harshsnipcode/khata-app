import { supabase } from "./supabase";

export async function loadCreatorLookup() {
  const [adminResult, employeeResult] = await Promise.all([
    supabase.from("admin_profiles").select("username, profile_name"),
    supabase.from("employees").select("username, auth_id"),
  ]);
  return {
    admins: adminResult.data || [],
    employees: employeeResult.data || [],
  };
}

export function resolveCreatorName(createdBy, lookup) {
  const raw = String(createdBy || "").trim();
  if (!raw) return "Unknown";
  const key = raw.toLowerCase();

  if (lookup) {
    for (const admin of lookup.admins || []) {
      if (String(admin.username || "").toLowerCase() === key) {
        return admin.profile_name || admin.username;
      }
    }
    for (const emp of lookup.employees || []) {
      if (String(emp.username || "").toLowerCase() === key) return emp.username;
      if (emp.auth_id && String(emp.auth_id).toLowerCase() === key) return emp.username;
    }
  }

  if (key === "admin") return "Admin";
  return "Unknown";
}
