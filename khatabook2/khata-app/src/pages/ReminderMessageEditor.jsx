import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSavedTemplate,
  saveTemplate,
  resetTemplate,
  DEFAULT_TEMPLATE,
} from "../lib/reminderTemplate";

function getHomePath() {
  const role = localStorage.getItem("khata_role");
  if (role === "admin") return "/admin/home";
  if (role === "employee") return "/employee/home";
  return "/";
}

const PLACEHOLDER_HELP = [
  { key: "{{customerName}}", desc: "Customer name" },
  { key: "{{balance}}", desc: "Balance amount" },
  { key: "{{balanceType}}", desc: "You Will Get / You Will Give" },
  { key: "{{ledgerLink}}", desc: "Link to the customer ledger" },
  { key: "{{businessName}}", desc: "Your business name" },
];

function ReminderMessageEditor() {
  const navigate = useNavigate();
  const [template, setTemplate] = useState("");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    setTemplate(getSavedTemplate());
  }, []);

  useEffect(() => {
    const vars = {
      customerName: "Harsh Sharma",
      balance: "710",
      balanceType: "You Will Get",
      ledgerLink: "https://example.com/share/customer/11",
      businessName:
        localStorage.getItem("khata_business_name") || "Shiv Shankar Dairy",
    };
    setPreview(
      template
        ? template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
        : ""
    );
  }, [template]);

  const handleSave = () => {
    saveTemplate(template);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetTemplate();
    setTemplate(DEFAULT_TEMPLATE);
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

        <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Reminder Message
        </h1>

        {/* Editor */}
        <div className="card rounded-2xl px-4 py-3 shadow-sm space-y-3">
          <p className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-widest">
            Template
          </p>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={8}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition resize-y font-mono leading-relaxed"
            placeholder={DEFAULT_TEMPLATE}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none shadow-sm"
            >
              {saved ? "Saved!" : "Save"}
            </button>
            <button
              onClick={handleReset}
              className="px-5 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest transition active:scale-95 cursor-pointer outline-none"
            >
              Reset To Default
            </button>
          </div>
        </div>

        {/* Placeholder help */}
        <div className="card rounded-2xl px-4 py-3 shadow-sm space-y-2">
          <p className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-widest">
            Available Placeholders
          </p>
          <div className="space-y-1.5">
            {PLACEHOLDER_HELP.map((ph) => (
              <div
                key={ph.key}
                className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2"
              >
                <code className="text-xs font-bold text-[var(--primary)] font-mono shrink-0">
                  {ph.key}
                </code>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {ph.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="card rounded-2xl px-4 py-3 shadow-sm space-y-2">
            <p className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-widest">
              Preview
            </p>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 whitespace-pre-wrap text-sm text-[var(--text-primary)] font-mono leading-relaxed">
              {preview}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReminderMessageEditor;
