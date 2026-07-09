import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function CollectionRouteEditor() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, route_position")
      .order("route_position", { ascending: true, nullsFirst: false });
    if (!error && data) {
      setCustomers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const moveUp = async (index) => {
    if (index <= 0) return;
    const customer = customers[index];
    const above = customers[index - 1];
    await swapPositions(customer, above);
  };

  const moveDown = async (index) => {
    if (index >= customers.length - 1) return;
    const customer = customers[index];
    const below = customers[index + 1];
    await swapPositions(customer, below);
  };

  const swapPositions = async (a, b) => {
    setSaving(true);
    try {
      await Promise.all([
        offlineSupabase.from("customers").update({ route_position: b.route_position }).eq("id", a.id),
        offlineSupabase.from("customers").update({ route_position: a.route_position }).eq("id", b.id),
      ]);
      await load();
    } catch (err) {
      console.error("Failed to swap positions", err);
    }
    setSaving(false);
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
          <span className="text-[10px] font-medium text-[var(--text-muted)]">{customers.length} customers</span>
        </div>

        <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Collection Route
        </h1>

        {saving && (
          <div className="bg-[var(--primary-light)] border border-[var(--primary)]/20 text-[var(--primary)] text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-xl animate-pulse">
            Saving...
          </div>
        )}

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-14 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-3xl card py-16 text-center text-[var(--text-secondary)]">
            <p className="font-bold text-sm">No customers yet.</p>
            <p className="text-xs mt-1">Add customers first, then arrange your collection route.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {customers.map((customer, index) => (
              <div
                key={customer.id}
                className="card rounded-xl px-3.5 py-3 flex items-center gap-3"
              >
                {/* Route number */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                  style={{
                    background: "#ebf6f5",
                    color: "#5cbdb9",
                  }}
                >
                  {index + 1}
                </div>

                {/* Customer avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    background: "#ebf6f5",
                    color: "#5cbdb9",
                  }}
                >
                  {(customer.name?.[0] || "?").toUpperCase()}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "#2d3436" }}>
                    {customer.name}
                  </p>
                  {customer.route_position !== null && customer.route_position !== undefined && (
                    <p className="text-[10px] font-medium text-[var(--text-muted)]">
                      Position #{index + 1}
                    </p>
                  )}
                </div>

                {/* Move Up / Down */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0 || saving}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      background: index === 0 ? "var(--border)" : "var(--primary-light)",
                      color: index === 0 ? "var(--text-muted)" : "var(--primary)",
                    }}
                    title="Move Up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === customers.length - 1 || saving}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      background: index === customers.length - 1 ? "var(--border)" : "var(--primary-light)",
                      color: index === customers.length - 1 ? "var(--text-muted)" : "var(--primary)",
                    }}
                    title="Move Down"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollectionRouteEditor;
