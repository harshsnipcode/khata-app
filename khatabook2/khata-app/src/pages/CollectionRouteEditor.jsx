import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import {
  sortCustomersByCollection,
  moveCustomerToCollectionPosition,
  persistCollectionOrder,
} from "../utils/customerOrdering";

function PositionModal({ customer, total, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = parseInt(value, 10);
    if (!num || num < 1 || num > total) return;
    setSaving(true);
    await onSave(customer.id, num);
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        className="w-full max-w-sm card rounded-3xl p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)] mb-1">
          Move {customer.name}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Currently at position #{customer.position}. Enter new position (1–{total}).
        </p>
        <input
          type="number"
          min="1"
          max={total}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300"
          placeholder={`1 – ${total}`}
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] font-bold py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="flex-1 bg-[var(--primary)] hover:opacity-90 text-white font-black py-3 rounded-2xl transition active:scale-95 text-[10px] uppercase tracking-widest cursor-pointer outline-none disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionRouteEditor() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalCustomer, setModalCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, collection_position")
      .order("collection_position", { ascending: true, nullsFirst: false });
    if (!error && data) {
      const ordered = sortCustomersByCollection(data);
      setCustomers(ordered);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSavePosition = async (customerId, newPosition) => {
    setSaving(true);
    try {
      const reordered = moveCustomerToCollectionPosition(customers, customerId, newPosition);
      setCustomers(reordered);
      await persistCollectionOrder(offlineSupabase, reordered);
    } catch (err) {
      console.error("Failed to save position", err);
      await load();
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

        {!saving && (
          <p className="text-[10px] text-[var(--text-muted)] font-medium">
            Tap a customer to change their position
          </p>
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
              <button
                key={customer.id}
                onClick={() => setModalCustomer({ ...customer, position: index + 1 })}
                className="card rounded-xl px-3.5 py-3 flex items-center gap-3 w-full text-left cursor-pointer active:scale-[0.98] transition-all duration-150"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                  style={{ background: "#ebf6f5", color: "#5cbdb9" }}
                >
                  {index + 1}
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ background: "#ebf6f5", color: "#5cbdb9" }}
                >
                  {(customer.name?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "#2d3436" }}>
                    {customer.name}
                  </p>
                  <p className="text-[10px] font-medium text-[var(--text-muted)]">
                    Position #{index + 1}
                  </p>
                </div>
                <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalCustomer && (
        <PositionModal
          customer={modalCustomer}
          total={customers.length}
          onClose={() => setModalCustomer(null)}
          onSave={handleSavePosition}
        />
      )}
    </div>
  );
}

export default CollectionRouteEditor;
