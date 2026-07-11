import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function EmployeeCredentialsEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await offlineSupabase.from("employees").select("*").eq("id", id).single();
      if (data) {
        setEmployee(data);
        setUsername(data.username);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setError("");

    const usernameChanged = username.trim() && username.trim() !== employee.username;
    const passwordProvided = !!password;

    if (!usernameChanged && !passwordProvided) {
      setError("No changes to save.");
      return;
    }

    setSaving(true);

    try {
      if (!navigator.onLine) {
        setError("Employee credential changes require an internet connection.");
        setSaving(false);
        return;
      }
      if (usernameChanged) {
        const newEmail = `${username.trim()}@example.com`;
        if (employee.auth_id) {
          await supabase.auth.admin.updateUserById(employee.auth_id, {
            email: newEmail,
          });
        }
        await supabase.from("employees").update({ username: username.trim() }).eq("id", id);
      }

      if (passwordProvided && employee.auth_id) {
        await supabase.auth.admin.updateUserById(employee.auth_id, {
          password,
        });
      }

      navigate(`/admin/employees/${id}/edit`, { replace: true });
    } catch (err) {
      setError(err?.message || err?.error_description || "Failed to update credentials.");
      setSaving(false);
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
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <div className="max-w-2xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate(`/admin/employees/${id}/edit`)}
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          {employee.username}
        </button>

        <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Edit Username / Password</h2>

        {/* Credentials Card */}
        <div className="card rounded-3xl p-5 shadow-md space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <p className="text-[var(--text-primary)] font-bold text-sm">Login Credentials</p>
              <p className="text-[var(--text-muted)] text-[10px] font-medium">Update username or password</p>
            </div>
          </div>

          <div className="space-y-4 pt-3 border-t border-[var(--border)]">
            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                placeholder={employee.username}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider pl-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 py-3.5 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                  placeholder="New password (leave blank to keep current)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none p-1"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
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
      </div>
    </div>
  );
}

export default EmployeeCredentialsEdit;
