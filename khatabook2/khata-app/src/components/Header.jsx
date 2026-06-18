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
      className="px-4 py-2.5 flex items-center justify-between relative z-10"
      style={{
        background: "#18ACF6",
        boxShadow: "0 2px 12px rgba(24,172,246,0.18)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <img
          src={heroLogo}
          alt="KhataBook logo"
          className="w-7 h-7 rounded-xl object-cover shadow-sm shrink-0"
          style={{ background: "rgba(255,255,255,0.22)" }}
        />
        <h1 className="text-sm font-bold tracking-tight text-white truncate max-w-[180px] sm:max-w-[280px]">
          {businessName}
        </h1>
        {isAdmin && (
          <button
            onClick={onEdit}
            className="p-1 rounded-lg transition-all duration-200 active:scale-90 shrink-0"
            style={{ color: "rgba(255,255,255,0.75)" }}
            title="Edit business name"
            onMouseEnter={e => e.currentTarget.style.color = "#fff"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white whitespace-nowrap">
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#52b788]' : 'bg-[#e76f51]'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {isOnline && syncStatus === 'synced' && <span className="text-white/60">· ✓ Synced</span>}
          {syncStatus === 'pending' && <span className="text-white/80">· ⟳ Syncing...</span>}
        </div>
        <button
          onClick={() => {
            try {
              localStorage.removeItem("khata_role");
              localStorage.removeItem("khata_user");
            } catch (e) {}
            window.location.href = "/";
          }}
          className="px-3 py-1 rounded-xl text-[10px] font-semibold tracking-wide uppercase transition-all duration-200 active:scale-95"
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