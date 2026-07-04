import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { hashPassword, generateSalt } from "../lib/adminAuth";

function AdminProfilesPage() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ profile_name: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    setCurrentUsername((localStorage.getItem("khata_user") || "").toLowerCase());
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("admin_profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (!fetchError && data) {
        setAdmins(data);
      }
    } catch {}
    setLoading(false);
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ profile_name: "", username: "", password: "" });
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (admin) => {
    setEditingId(admin.id);
    setFormData({ profile_name: admin.profile_name, username: admin.username, password: "" });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ profile_name: "", username: "", password: "" });
    setFormError("");
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setFormError("");
    if (!formData.profile_name.trim()) {
      setFormError("Profile Name must not be empty.");
      return;
    }
    if (!formData.username.trim()) {
      setFormError("Username must not be empty.");
      return;
    }
    if (!editingId && !formData.password) {
      setFormError("Password cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      const trimmedUsername = formData.username.trim().toLowerCase();

      if (editingId) {
        const { data: existing } = await supabase
          .from("admin_profiles")
          .select("id")
          .eq("username", trimmedUsername)
          .neq("id", editingId)
          .maybeSingle();
        if (existing) {
          setFormError("Username already exists.");
          setSaving(false);
          return;
        }

        const updates = {
          profile_name: formData.profile_name.trim(),
          username: trimmedUsername,
          updated_at: new Date().toISOString(),
        };

        if (formData.password) {
          const salt = generateSalt();
          updates.password_hash = await hashPassword(formData.password, salt);
          updates.password_salt = salt;
        }

        await supabase.from("admin_profiles").update(updates).eq("id", editingId);

        if (trimmedUsername === currentUsername) {
          localStorage.setItem("khata_user", trimmedUsername);
          localStorage.setItem("khata_profile_name", formData.profile_name.trim());
        }
      } else {
        const { data: existing } = await supabase
          .from("admin_profiles")
          .select("id")
          .eq("username", trimmedUsername)
          .maybeSingle();
        if (existing) {
          setFormError("Username already exists.");
          setSaving(false);
          return;
        }

        const salt = generateSalt();
        const pwdHash = await hashPassword(formData.password, salt);
        await supabase.from("admin_profiles").insert({
          profile_name: formData.profile_name.trim(),
          username: trimmedUsername,
          password_hash: pwdHash,
          password_salt: salt,
        });
      }

      setSuccess(editingId ? "Admin profile updated." : "Admin profile created.");
      closeForm();
      await fetchAdmins();
    } catch {
      setFormError("An error occurred. Please try again.");
    }
    setSaving(false);
  };

  const handleDelete = async (admin) => {
    if (admin.username.toLowerCase() === currentUsername) {
      setError("You cannot delete your own account.");
      return;
    }
    if (admins.length <= 1) {
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to delete admin "${admin.profile_name}" (${admin.username})?`
    );
    if (!confirmed) return;

    try {
      await supabase.from("admin_profiles").delete().eq("id", admin.id);
      setSuccess(`Admin "${admin.profile_name}" deleted.`);
      await fetchAdmins();
    } catch {
      setError("Failed to delete admin.");
    }
  };

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] px-4 py-3 select-none animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Admin Profiles
          </h1>
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer outline-none active:scale-95 shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Admin
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold p-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold p-3 rounded-xl text-center">
            {success}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="card rounded-2xl px-4 py-8 shadow-sm text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">No admin profiles yet.</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Click "Add Admin" to create one.</p>
          </div>
        ) : (
          admins.map((admin) => {
            const isCurrent = admin.username.toLowerCase() === currentUsername;
            const isLast = admins.length <= 1;
            return (
              <div key={admin.id} className={`card rounded-2xl px-4 py-3 shadow-sm ${isCurrent ? "border-emerald-300/50" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {admin.profile_name}
                      </p>
                      {isCurrent && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-bold uppercase tracking-wider border border-emerald-500/20">
                          Current Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-medium text-[var(--text-secondary)] mt-0.5">
                      Username: {admin.username}
                    </p>
                    {admin.created_at && (
                      <p className="text-[9px] text-[var(--text-muted)] mt-0.5">
                        Created: {formatDate(admin.created_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => openEditForm(admin)}
                      className="p-2 rounded-lg hover:bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
                      title="Edit admin"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(admin)}
                      disabled={isCurrent || isLast}
                      className="p-2 rounded-lg hover:bg-[var(--secondary)] border border-[var(--border)] text-[var(--danger)] transition cursor-pointer outline-none active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isCurrent ? "Cannot delete yourself" : isLast ? "Must keep at least one admin" : "Delete admin"}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <div className="w-full max-w-md card rounded-2xl p-5 shadow-lg animate-scale-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
                  {editingId ? "Edit Admin" : "Add Admin"}
                </h2>
                <button
                  onClick={closeForm}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer outline-none"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold p-2.5 rounded-xl text-center mb-3">
                  {formError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mb-1">Profile Name</p>
                  <input
                    type="text"
                    value={formData.profile_name}
                    onChange={(e) => handleFormChange("profile_name", e.target.value)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
                    placeholder="e.g., Dad, Harsh, Gopal"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mb-1">Username</p>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleFormChange("username", e.target.value)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mb-1">
                    Password {editingId && "(leave blank to keep current)"}
                  </p>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleFormChange("password", e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
                      placeholder={editingId ? "New password (optional)" : "Enter password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

              <div className="flex gap-2 mt-5">
                <button
                  onClick={closeForm}
                  className="flex-1 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] font-bold text-[10px] uppercase tracking-wider hover:bg-[var(--surface)] transition cursor-pointer outline-none active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer outline-none active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Admin"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminProfilesPage;
