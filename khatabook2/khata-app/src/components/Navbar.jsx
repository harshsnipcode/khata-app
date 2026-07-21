import { useNavigate, useLocation } from "react-router-dom";

const ROUTES = {
  customers: "/admin/home",
  catalogue: "/admin/home",
  employees: "/admin/staff",
  excel: "/admin/excel",
  reminder: "/admin/reminder",
};

function isEmployeesRoute(pathname) {
  return (
    pathname.startsWith("/admin/staff") ||
    pathname.startsWith("/admin/employees")
  );
}

function isSettingsRoute(pathname) {
  return pathname.startsWith("/settings");
}

function isExcelRoute(pathname) {
  return pathname.startsWith("/admin/excel");
}

function isReminderRoute(pathname) {
  return pathname.startsWith("/admin/reminder");
}

function Navbar({ activeTab, setActiveTab, isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = ["customers", "catalogue"];
  if (isAdmin) {
    tabs.push("excel", "reminder", "employees");
  } else {
    const level = Number(localStorage.getItem("khata_permission_level")) || 1;
    if (level >= 2) tabs.push("excel");
  }
  tabs.push("settings");

  const tabLabels = {
    customers: "Customers",
    catalogue: "Catalogue",
    employees: "Employees",
    excel: "Excel",
    reminder: "Reminder",
    settings: "Settings",
  };

  const handleTabClick = (tab) => {
    if (tab === "settings") {
      navigate("/settings");
      return;
    }
    if (tab === "excel") {
      navigate("/admin/excel", { state: { activeTab: "excel" } });
    } else if (tab === "reminder") {
      navigate("/admin/reminder", { state: { activeTab: "reminder" } });
    } else if (isAdmin) {
      navigate(ROUTES[tab], { state: { activeTab: tab } });
    } else {
      navigate("/employee/home", { state: { activeTab: tab } });
    }
    if (setActiveTab) setActiveTab(tab);
  };

  const isActiveTab = (tab) => {
    if (tab === "settings") return isSettingsRoute(location.pathname);
    if (tab === "excel") return isExcelRoute(location.pathname);
    if (tab === "employees") return isEmployeesRoute(location.pathname);
    if (tab === "reminder") return isReminderRoute(location.pathname);
    if (tab === "customers" || tab === "catalogue") {
      if (isEmployeesRoute(location.pathname) || isExcelRoute(location.pathname) || isReminderRoute(location.pathname) || isSettingsRoute(location.pathname)) return false;
      return activeTab === tab;
    }
    return activeTab === tab;
  };

  return (
    <div
      className="px-3 py-1.5 flex gap-0.5 overflow-x-auto select-none border-b"
      style={{ background: "#fff", borderColor: "#e9ecef" }}
    >
      {tabs.map((tab) => {
        const isActive = isActiveTab(tab);
        return (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
            className="text-[10px] font-semibold px-3.5 py-2 rounded-xl transition-all duration-200 relative cursor-pointer outline-none"
            style={
              isActive
                ? {
                    background: "#ebf6f5",
                    color: "#5cbdb9",
                    fontWeight: "700",
                  }
                : {
                    background: "transparent",
                    color: "#636e72",
                  }
            }
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = "#f8f9fa";
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            {tabLabels[tab]}
            {isActive && (
              <span
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                style={{ background: "#5cbdb9" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Navbar;
