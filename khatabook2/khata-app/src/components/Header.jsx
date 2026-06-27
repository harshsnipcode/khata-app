import { useEffect, useState } from "react";
import heroLogo from "../assets/hero.png";

function Header({ businessName = "Shiv Shankar Dairy" }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [logo, setLogo] = useState(() => localStorage.getItem("khata_business_logo"));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSync = (e) => {
      if (e.detail?.status === 'synced') {
        setSyncStatus('synced');
      }
    };
    const handleLogoUpdate = () => {
      setLogo(localStorage.getItem("khata_business_logo"));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-status', handleSync);
    window.addEventListener('business-profile-update', handleLogoUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-status', handleSync);
      window.removeEventListener('business-profile-update', handleLogoUpdate);
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
          src={logo || heroLogo}
          alt="Business logo"
          className="w-7 h-7 rounded-xl object-cover shadow-sm shrink-0"
          style={{ background: "rgba(255,255,255,0.22)" }}
        />
        <h1 className="text-sm font-bold tracking-tight text-white truncate max-w-[180px] sm:max-w-[280px]">
          {businessName}
        </h1>
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
      </div>
    </div>
  );
}

export default Header;
