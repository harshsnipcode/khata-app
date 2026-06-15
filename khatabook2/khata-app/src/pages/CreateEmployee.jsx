import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import Navbar from "../components/Navbar";

const PERMISSION_LEVELS = [
  { value: 1, label: "Level 1", description: "View Entries & Send Reminders" },
  { value: 2, label: "Level 2", description: "Add & View Entries/Parties" },
  { value: 3, label: "Level 3", description: "Add, View, Edit, Delete: Entries/Parties" },
];

function CreateEmployee() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [salaryEnabled, setSalaryEnabled] = useState(false);
  const [salaryStartDate, setSalaryStartDate] = useState("");
  const [salaryType, setSalaryType] = useState("monthly");
  const [salaryAmount, setSalaryAmount] = useState("");

  const [permissionsEnabled, setPermissionsEnabled] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState(1);
  const [fullPermissions, setFullPermissions] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const [businessName] = useState(() => localStorage.getItem("khata_business_name") || "My Business");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  const validate = () => {
    if (!username.trim()) { setMessage("Username is required."); setMessageType("error"); return false; }
    if (!password) { setMessage("Password is required."); setMessageType("error"); return false; }
    if (salaryEnabled) {
      if (!salaryAmount) { setMessage("Salary amount is required."); setMessageType("error"); return false; }
      if (!salaryStartDate) { setMessage("Start date is required."); setMessageType("error"); return false; }
    }
    return true;
  };

  const handleSave = async () => {
    setMessage("");
    if (!validate()) return;

    setSaving(true);

    const pseudoEmail = `${username.trim()}@example.com`;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: pseudoEmail,
      password,
      options: { data: { username: username.trim() } },
    });

    if (authError) {
      setMessage(authError.message || "Unable to create employee.");
      setMessageType("error");
      setSaving(false);
      return;
    }

    const auth_id = authData?.user?.id || null;
    const effectiveLevel = fullPermissions ? 3 : permissionLevel;

    const { error: dbError } = await supabase.from("employees").insert([
      {
        username: username.trim(),
        auth_id,
        created_by: (await supabase.auth.getUser())?.data?.user?.id || "admin",
        attendance_enabled: salaryEnabled,
        permissions_enabled: permissionsEnabled,
        salary_type: salaryEnabled ? salaryType : null,
        salary_amount: salaryEnabled ? Number(salaryAmount) : null,
        salary_start_date: salaryEnabled ? salaryStartDate : null,
        permission_level: permissionsEnabled ? effectiveLevel : 1,
      },
    ]);

    if (dbError) {
      setMessage(dbError.message);
      setMessageType("error");
      setSaving(false);
      return;
    }

    setMessage("Employee created successfully");
    setMessageType("success");

    setTimeout(() => {
      navigate("/admin/staff");
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="relative z-10 animate-fade-in">
        <Header businessName={businessName} isAdmin={true} />
        <Navbar activeTab="employees" setActiveTab={() => {}} isAdmin={true} />

        <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
          {/* Back link */}
          <button
            onClick={() => navigate("/admin/staff")}
            className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            Staff
          </button>

          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Add New Employee</h2>

          {/* Basic Information */}
          <div className="card rounded-3xl p-5 shadow-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--text-primary)] font-bold text-sm">Basic Information</p>
                <p className="text-[var(--text-muted)] text-[10px] font-medium">Employee login credentials</p>
              </div>
            </div>

            <div className="space-y-4 pt-3 border-t border-[var(--border)]">
              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                  Employee Username <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                  placeholder="Enter employee username"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                  Password <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                  placeholder="Enter employee password"
                />
              </div>
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
                onClick={() => setSalaryEnabled(!salaryEnabled)}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer outline-none ${
                  salaryEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                    salaryEnabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {salaryEnabled && (
              <div className="space-y-5 pt-3 border-t border-[var(--border)] animate-fade-in">
                <div className="space-y-2">
                  <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                    Salary Calculation Start Date
                  </label>
                  <input
                    type="date"
                    value={salaryStartDate}
                    onChange={(e) => setSalaryStartDate(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                    Salary Type
                  </label>
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
                    {salaryType === "monthly" ? "Monthly Salary" : "Daily Salary"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] font-bold text-sm">₹</span>
                    <input
                      type="number"
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      placeholder={salaryType === "monthly" ? "15000" : "500"}
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
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                    permissionsEnabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {permissionsEnabled && (
              <div className="space-y-4 pt-3 border-t border-[var(--border)] animate-fade-in">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => {
                      setFullPermissions(!fullPermissions);
                      if (!fullPermissions) setPermissionLevel(3);
                    }}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                      fullPermissions
                        ? "bg-[var(--primary)] border-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    {fullPermissions && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[var(--text-primary)] text-sm font-semibold">Give Full Permissions</span>
                </label>

                <div className="space-y-2">
                  <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                    Permissions
                  </label>
                  <button
                    onClick={() => setShowPermissionModal(true)}
                    disabled={fullPermissions}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-left text-sm font-semibold flex items-center justify-between transition-all duration-200 hover:border-[var(--border-hover)] cursor-pointer outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className={fullPermissions ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}>
                      {fullPermissions ? "Level 3 — Full Access" : PERMISSION_LEVELS.find(p => p.value === permissionLevel)?.label}
                    </span>
                    <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {!fullPermissions && permissionLevel && (
                    <p className="text-[10px] text-[var(--text-muted)] font-medium pl-1">
                      {PERMISSION_LEVELS.find(p => p.value === permissionLevel)?.description}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`p-3.5 rounded-2xl text-xs font-semibold border ${
              messageType === "success"
                ? "bg-[var(--success-light)] border-[var(--success)]/20 text-[var(--success)]"
                : "bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]"
            }`}>
              {message}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer outline-none shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "SAVE EMPLOYEE"}
          </button>
        </div>
      </div>

      {/* Permission Level Modal */}
      {showPermissionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
          onClick={() => setShowPermissionModal(false)}
        >
          <div
            className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Select Permission Level</h2>
            <div className="space-y-3">
              {PERMISSION_LEVELS.map((level) => (
                <label
                  key={level.value}
                  onClick={() => {
                    setPermissionLevel(level.value);
                    setFullPermissions(level.value === 3);
                  }}
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                    permissionLevel === level.value
                      ? "border-[var(--primary)] bg-[var(--primary-light)]"
                      : "border-[var(--border)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      permissionLevel === level.value ? "border-[var(--primary)]" : "border-[var(--border)]"
                    }`}>
                      {permissionLevel === level.value && (
                        <span className="w-3 h-3 rounded-full bg-[var(--primary)]" />
                      )}
                    </span>
                    <div>
                      <p className="text-[var(--text-primary)] font-bold text-sm">{level.label}</p>
                      <p className="text-[var(--text-secondary)] text-xs mt-0.5">{level.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={() => setShowPermissionModal(false)}
              className="w-full mt-5 py-3.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateEmployee;
