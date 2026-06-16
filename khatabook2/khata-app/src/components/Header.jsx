import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import heroLogo from "../assets/hero.png";

function Header({ businessName = "Shiv Shankar Dairy", onEdit, isAdmin }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState('synced');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSync = (e) => {
      if (e.detail?.status === 'synced') {
        setSyncStatus('synced');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-status', handleSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-status', handleSync);
    };
  }, []);

  return (
    <div
      className="px-6 py-4 flex items-center justify-between relative z-10"
      style={{
        background: "#18ACF6",
        boxShadow: "0 2px 12px rgba(24,172,246,0.18)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <img
          src={heroLogo}
          alt="KhataBook logo"
          className="w-8 h-8 rounded-xl object-cover shadow-sm"
          style={{ background: "rgba(255,255,255,0.22)" }}
        />
        <h1 className="text-lg font-bold tracking-tight text-white">
          {businessName}
        </h1>
        {isAdmin && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-all duration-200 active:scale-90"
            style={{ color: "rgba(255,255,255,0.75)" }}
            title="Edit business name"
            onMouseEnter={e => e.currentTarget.style.color = "#fff"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          {isOnline ? (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#52b788]" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#e76f51]" />
              Offline
            </span>
          )}
          {syncStatus === 'pending' && <span className="text-white/80">⟳ Syncing...</span>}
          {syncStatus === 'synced' && isOnline && <span className="text-white/60">✓ Synced</span>}
        </div>
        <button
          onClick={() => {
            try {
              localStorage.removeItem("khata_role");
              localStorage.removeItem("khata_user");
            } catch (e) {}
            window.location.href = "/";
          }}
          className="px-4 py-1.5 rounded-xl text-xs font-semibold tracking-wide uppercase transition-all duration-200 active:scale-95"
          style={{
            background: "rgba(255,255,255,0.18)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default Header;