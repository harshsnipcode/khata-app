import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function SettingsPage() {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const name = localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy";
    const r = localStorage.getItem("khata_role") || "";
    setBusinessName(name);
    setRole(r === "admin" ? "Admin" : r === "employee" ? "Employee" : "");
  }, []);

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("khata_role");
      localStorage.removeItem("khata_user");
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

        {/* Section 1: Account */}
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
          </div>
        </div>

        {/* Section 2: Recycle Bin */}
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

        {/* Section 3: Logout */}
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
