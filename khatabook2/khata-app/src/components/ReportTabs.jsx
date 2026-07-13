import { useNavigate } from "react-router-dom";

function ReportTabs({ active }) {
  const navigate = useNavigate();
  const tabs = [
    { key: "transactions", label: "Customer Transactions", path: "/admin/reports/customer-transactions" },
    { key: "profit", label: "Profit Report", path: "/admin/reports/profit" },
  ];

  return (
    <div className="grid grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (!selected) navigate(tab.path);
            }}
            className={`rounded-xl px-3 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider transition cursor-pointer outline-none ${
              selected
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default ReportTabs;
