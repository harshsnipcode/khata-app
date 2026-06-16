import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Navbar from "../components/Navbar";

const reportTabs = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customer" },
  { key: "bills", label: "Bills" },
  { key: "gst", label: "GST" },
  { key: "daywise", label: "Day-wise" },
];

function Reports() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("customer");
  const [businessName] = useState(() => localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header businessName={businessName} isAdmin={true} />
      <Navbar activeTab="employees" setActiveTab={() => {}} isAdmin={true} />

      <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Reports Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {reportTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer outline-none whitespace-nowrap ${
                activeTab === t.key
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "customer" && (
          <div className="space-y-4">
            {/* Customer Transactions Report */}
            <div
              onClick={() => navigate("/admin/reports/customer-transactions")}
              className="card rounded-3xl p-5 shadow-md hover:card-hover transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] font-bold text-sm">Customer Transactions Report</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-medium mt-0.5">Summary of all customer transactions</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-[var(--text-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>

            {/* Customer List PDF (placeholder) */}
            <div className="card rounded-3xl p-5 shadow-md opacity-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] font-bold text-sm">Customer List PDF</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-medium mt-0.5">Coming soon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab !== "customer" && activeTab !== "all" && (
          <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
            <p className="font-bold text-sm">Coming soon</p>
          </div>
        )}

        {activeTab === "all" && (
          <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
            <p className="font-bold text-sm">Select a report type above</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
