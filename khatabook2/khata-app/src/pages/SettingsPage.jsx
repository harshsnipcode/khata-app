import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import useSwipeNavigation from "../hooks/useSwipeNavigation";

function SettingsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [businessName, setBusinessName] = useState("");
  const [editName, setEditName] = useState("");
  const [logo, setLogo] = useState(null);
  const [newLogo, setNewLogo] = useState(null);
  const [role, setRole] = useState("");
  const [profileName, setProfileName] = useState("");
  const [saved, setSaved] = useState(false);

  const isAdmin = role === "Admin";

  useEffect(() => {
    const name = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";
    const savedLogo = localStorage.getItem("khata_business_logo");
    const r = localStorage.getItem("khata_role") || "";
    setBusinessName(name);
    setEditName(name);
    setLogo(savedLogo);
    setRole(r === "admin" ? "Admin" : r === "employee" ? "Employee" : "");
    if (r === "admin") {
      const storedProfile = localStorage.getItem("khata_profile_name");
      if (storedProfile) {
        setProfileName(storedProfile);
      } else {
        const user = localStorage.getItem("khata_user") || "";
        setProfileName(user.charAt(0).toUpperCase() + user.slice(1));
      }
    }
  }, []);

  useSwipeNavigation({
    onSwipeRight: () => {
      const r = localStorage.getItem("khata_role");
      if (r === "admin") {
        navigate("/admin/excel", { state: { activeTab: "excel" } });
      } else {
        navigate("/employee/home", { state: { activeTab: "catalogue" } });
      }
    },
  });

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setNewLogo(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const name = editName.trim() || "Shiv Shankar Dairy";
    localStorage.setItem("khata_business_name", name);
    setBusinessName(name);
    if (newLogo) {
      localStorage.setItem("khata_business_logo", newLogo);
      setLogo(newLogo);
      setNewLogo(null);
    }
    window.dispatchEvent(new CustomEvent("business-profile-update"));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    try {
      const role = localStorage.getItem("khata_role");
      if (role === "employee") {
        await supabase.auth.signOut();
      }
    } catch (e) {}
    try {
      localStorage.removeItem("khata_role");
      localStorage.removeItem("khata_user");
      localStorage.removeItem("khata_profile_name");
    } catch (e) {}
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] px-4 py-3 select-none animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(getHomePath())}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Settings
        </h1>

        {/* Business Profile */}
        <div className="card rounded-2xl px-4 py-4 shadow-sm">
          <div className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-widest mb-3">Business Profile</div>

          {/* Logo preview */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[var(--border)] shrink-0 flex items-center justify-center bg-[var(--surface)]">
              {(newLogo || logo) ? (
                <img src={newLogo || logo} alt="Business logo" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-6 h-6 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{businessName}</p>
              <p className="text-[10px] font-medium text-[var(--text-secondary)]">{role}</p>
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-3">
              {/* Business name input */}
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mb-1">Business Name</p>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
                  placeholder="Enter business name"
                />
              </div>

              {/* Upload logo */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--surface)] transition cursor-pointer outline-none active:scale-95"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {newLogo ? "Change Logo" : "Upload Logo"}
                </button>
                {newLogo && (
                  <p className="text-[10px] text-[var(--success)] font-medium mt-1">New logo ready to save</p>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                className="w-full py-3 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs uppercase tracking-widest transition cursor-pointer outline-none active:scale-95 shadow-sm"
              >
                {saved ? "Saved ✓" : "Save Changes"}
              </button>
            </div>
          )}

          {!isAdmin && (
            <p className="text-[11px] text-[var(--text-muted)] font-medium">Only the admin can edit the business profile.</p>
          )}
        </div>

        {/* Section: Account */}
        <div className="card rounded-2xl px-4 py-3 shadow-sm">
          <div className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-widest mb-2">Account</div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">Business</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{businessName}</p>
                </div>
              </div>
            </div>
            {isAdmin ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">Profile</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{profileName} ({role})</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--secondary)] border border-[var(--danger)]/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">Role</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{role}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section: Download all entries */}
        <button
          onClick={() => navigate("/settings/product-groups")}
          className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.3 7 12 12l8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">Create / Edit Product Groups</p>
            <p className="text-[10px] font-medium text-[var(--text-secondary)]">Organize catalogue products</p>
          </div>
          <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Section: Download all entries */}
        <button
          onClick={() => navigate("/settings/downloadexcel")}
          className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M5 21h14" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">Download All Entries</p>
            <p className="text-[10px] font-medium text-[var(--text-secondary)]">Export transaction quantities to Excel</p>
          </div>
          <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Section: Recycle Bin */}
        <button
          onClick={() => navigate("/settings/recycle-bin")}
          className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <span className="text-sm">🗑</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">Recycle Bin</p>
            <p className="text-[10px] font-medium text-[var(--text-secondary)]">View deleted items</p>
          </div>
          <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Section: Reminder Message */}
        <button
          onClick={() => navigate("/settings/reminder-message")}
          className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <span className="text-sm">📩</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">Reminder Message</p>
            <p className="text-[10px] font-medium text-[var(--text-secondary)]">Edit WhatsApp reminder template</p>
          </div>
          <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Manage Admin Profiles */}
        {isAdmin && (
          <button
            onClick={() => navigate("/settings/admins")}
            className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-[var(--text-primary)]">Manage Admin Profiles</p>
              <p className="text-[10px] font-medium text-[var(--text-secondary)]">Add, edit, or remove admin accounts</p>
            </div>
            <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Collection Route — Admin only */}
        {isAdmin && (
          <button
            onClick={() => navigate("/settings/collection-route")}
            className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <span className="text-sm">📍</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-[var(--text-primary)]">Edit Collection Route</p>
              <p className="text-[10px] font-medium text-[var(--text-secondary)]">Arrange customer visit order</p>
            </div>
            <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Section: Logout */}
        <button
          onClick={handleLogout}
          className="w-full card rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer outline-none active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--secondary)] border border-[var(--danger)]/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[var(--danger)]">Logout</p>
            <p className="text-[10px] font-medium text-[var(--text-secondary)]">Sign out of your account</p>
          </div>
          <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SettingsPage;
