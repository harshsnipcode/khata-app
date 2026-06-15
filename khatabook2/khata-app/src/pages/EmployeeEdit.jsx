import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PERMISSION_LEVELS = [
  { value: 0, label: "NONE", description: "No access" },
  { value: 1, label: "VIEW", description: "View Entries & Send Reminders" },
  { value: 2, label: "ADD_VIEW", description: "Add & View Entries/Parties" },
  { value: 3, label: "FULL", description: "Add, View, Edit, Delete: Entries/Parties" },
];

function EmployeeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [salaryStartDate, setSalaryStartDate] = useState("");
  const [salaryType, setSalaryType] = useState("monthly");
  const [salaryAmount, setSalaryAmount] = useState("");

  const [permissionsEnabled, setPermissionsEnabled] = useState(false);
  const [fullPermission, setFullPermission] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState(1);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("employees").select("*").eq("id", id).single();
      if (data) {
        setEmployee(data);
        setAttendanceEnabled(data.attendance_enabled || false);
        setPermissionsEnabled(data.permissions_enabled || false);
        setSalaryStartDate(data.salary_start_date || "");
        setSalaryType(data.salary_type || "monthly");
        setSalaryAmount(data.salary_amount ? String(data.salary_amount) : "");
        setPermissionLevel(data.permission_level || 1);
        setFullPermission(data.permission_level === 3);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const effectiveLevel = fullPermission ? 3 : permissionLevel;

    const { error: dbError } = await supabase.from("employees").update({
      attendance_enabled: attendanceEnabled,
      permissions_enabled: permissionsEnabled,
      salary_type: attendanceEnabled ? salaryType : null,
      salary_amount: attendanceEnabled ? Number(salaryAmount) : null,
      salary_start_date: attendanceEnabled ? salaryStartDate : null,
      permission_level: permissionsEnabled ? effectiveLevel : 1,
    }).eq("id", id);

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    navigate(`/admin/employees/${id}`, { replace: true });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (employee.auth_id) {
        await supabase.auth.admin.deleteUser(employee.auth_id);
      }
      await supabase.from("employee_attendance").delete().eq("employee_id", id);
      await supabase.from("employees").delete().eq("id", id);
      navigate("/admin/staff", { replace: true });
    } catch (err) {
      console.error("Delete failed", err);
      setDeleting(false);
      setShowDeleteModal(false);
    }
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

        {/* Staff Card */}
        <div className="card rounded-3xl p-6 shadow-md flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xl shrink-0">
            {employee.username[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1">
            <p className="text-[var(--text-primary)] font-bold text-lg">{employee.username}</p>
            <p className="text-[var(--text-muted)] text-xs font-medium">Employee</p>
          </div>
        </div>

        {/* Attendance & Salary Toggle */}
        <div className="card rounded-3xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--text-primary)] font-bold text-sm">Attendance & Salary</p>
                <p className="text-[var(--text-muted)] text-[10px] font-medium">Manage salary configuration</p>
              </div>
            </div>
            <button
              onClick={() => setAttendanceEnabled(!attendanceEnabled)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer outline-none ${
                attendanceEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                attendanceEnabled ? "translate-x-6" : "translate-x-0"
              }`} />
            </button>
          </div>

          {attendanceEnabled && (
            <div className="space-y-5 pt-3 border-t border-[var(--border)] animate-fade-in">
              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Salary Start Date</label>
                <input
                  type="date"
                  value={salaryStartDate}
                  onChange={(e) => setSalaryStartDate(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Salary Type</label>
                <div className="flex gap-3">
                  <label
                    onClick={() => setSalaryType("monthly")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 text-sm font-bold ${
                      salaryType === "monthly"
                        ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      salaryType === "monthly" ? "border-[var(--primary)]" : "border-[var(--border)]"
                    }`}>
                      {salaryType === "monthly" && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                    </span>
                    Monthly
                  </label>
                  <label
                    onClick={() => setSalaryType("daily")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 text-sm font-bold ${
                      salaryType === "daily"
                        ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      salaryType === "daily" ? "border-[var(--primary)]" : "border-[var(--border)]"
                    }`}>
                      {salaryType === "daily" && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                    </span>
                    Daily
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                  {salaryType === "monthly" ? "Enter Monthly Salary" : "Enter Daily Salary"}
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={salaryAmount}
                    onChange={(e) => setSalaryAmount(e.target.value)}
                    placeholder={salaryType === "monthly" ? "10000" : "500"}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-10 pr-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Permissions Toggle */}
        <div className="card rounded-3xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--text-primary)] font-bold text-sm">Permissions</p>
                <p className="text-[var(--text-muted)] text-[10px] font-medium">Manage employee permissions</p>
              </div>
            </div>
            <button
              onClick={() => setPermissionsEnabled(!permissionsEnabled)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer outline-none ${
                permissionsEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                permissionsEnabled ? "translate-x-6" : "translate-x-0"
              }`} />
            </button>
          </div>

          {permissionsEnabled && (
            <div className="space-y-4 pt-3 border-t border-[var(--border)] animate-fade-in">
              {/* Full Permission Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => {
                    setFullPermission(!fullPermission);
                    if (!fullPermission) setPermissionLevel(3);
                  }}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    fullPermission
                      ? "bg-[var(--primary)] border-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {fullPermission && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className="text-[var(--text-primary)] text-sm font-semibold">
                  Give full permission to {employee.username}
                </span>
              </label>

              {/* Permission Dropdown */}
              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">Permissions</label>
                <div className="relative">
                  <select
                    value={fullPermission ? 3 : permissionLevel}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPermissionLevel(val);
                      setFullPermission(val === 3);
                    }}
                    disabled={fullPermission}
                    className="w-full appearance-none bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {PERMISSION_LEVELS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] font-medium pl-1">
                  {fullPermission
                    ? "Full access — Add, View, Edit, Delete"
                    : (PERMISSION_LEVELS.find(p => p.value === permissionLevel)?.description || "")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-3.5 rounded-2xl text-xs font-semibold border bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "SAVE"}
        </button>

        {/* Delete */}
        <div className="pt-2">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-3.5 rounded-2xl border border-[var(--danger)]/30 text-[var(--danger)] font-bold text-xs uppercase tracking-widest hover:bg-[var(--danger-light)] transition cursor-pointer outline-none active:scale-95"
          >
            Delete Staff
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
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

export default EmployeeEdit;
