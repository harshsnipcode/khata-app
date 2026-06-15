import { useNavigate, useLocation } from "react-router-dom";

const ROUTES = {
  customers: "/admin/home",
  catalogue: "/admin/home",
  employees: "/admin/staff",
  reports: "/admin/reports",
};

function isEmployeesRoute(pathname) {
  return (
    pathname.startsWith("/admin/staff") ||
    pathname.startsWith("/admin/employees")
  );
}

function isReportsRoute(pathname) {
  return pathname.startsWith("/admin/reports");
}

function Navbar({ activeTab, setActiveTab, isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = ["customers", "catalogue"];
  if (isAdmin) tabs.push("employees", "reports");

  const tabLabels = {
    customers: "Customers",
    catalogue: "Catalogue",
    employees: "Employees",
    reports: "Reports",
  };

  const handleTabClick = (tab) => {
    const route = ROUTES[tab];
    navigate(route, { state: { activeTab: tab } });
    if (setActiveTab) setActiveTab(tab);
  };

  const isActiveTab = (tab) => {
    if (tab === "employees") return isEmployeesRoute(location.pathname);
    if (tab === "reports") return isReportsRoute(location.pathname);
    if (tab === "customers" || tab === "catalogue") {
      if (isEmployeesRoute(location.pathname) || isReportsRoute(location.pathname)) return false;
      return activeTab === tab;
    }
    return activeTab === tab;
  };

  return (
    <div
      className="px-5 py-2 flex gap-1 overflow-x-auto select-none border-b"
      style={{ background: "#fff", borderColor: "#e9ecef" }}
    >
      {tabs.map((tab) => {
        const isActive = isActiveTab(tab);
        return (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
            className={`text-xs font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 relative cursor-pointer outline-none`}
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
                className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
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
