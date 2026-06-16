import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";
import DeleteCustomerModal from "../components/DeleteCustomerModal";

/* Derive initials from a full name */
function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* Editable field state */
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [type, setType] = useState("Customer");

  /* UI state */
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  /* Pricing state */
  const [products, setProducts] = useState([]);
  const [customPrices, setCustomPrices] = useState({});

  /* ── Fetch customer, products, and custom prices ── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");

      const [customerRes, productRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("products").select("id, name, sale_price").order("name"),
      ]);

      if (customerRes.error) {
        setLoadError(customerRes.error.message || "Unable to load customer.");
        setLoading(false);
        return;
      }

      const customerData = customerRes.data;
      setCustomer(customerData);
      setName(customerData.name || "");
      setPhone(customerData.phone || "");
      setAddress(customerData.address || "");
      setGstin(customerData.gstin || "");
      setType(customerData.type || "Customer");

      if (!productRes.error) {
        setProducts(productRes.data || []);

        const { data: prices } = await supabase
          .from("customer_product_prices")
          .select("product_id, custom_price")
          .eq("customer_id", id);

        if (prices) {
          const priceMap = {};
          prices.forEach((p) => { priceMap[p.product_id] = p.custom_price; });
          setCustomPrices(priceMap);
        }
      }

      setLoading(false);
    };
    load();
  }, [id]);

  /* ── Save edits ── */
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    const { error } = await offlineSupabase
      .from("customers")
      .update({ name, phone, address, gstin, type, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setSaveMsg("Failed to save: " + (error.message || "Unknown error"));
      setSaving(false);
      return;
    }

    // Upsert custom pricing
    const priceEntries = Object.entries(customPrices);
    try {
        // Delete any existing prices for this customer
        await offlineSupabase.from("customer_product_prices").delete({ id }).eq("customer_id", id);

        // Insert current prices
        if (priceEntries.length > 0) {
          const rows = priceEntries.map(([productId, customPrice]) => ({
            customer_id: Number(id),
            product_id: Number(productId),
            custom_price: customPrice,
          }));
          const { error: priceError } = await offlineSupabase.from("customer_product_prices").insert(rows);
          if (priceError) throw priceError;
        }

      setSaveMsg("Saved successfully!");
      setCustomer((prev) => ({ ...prev, name, phone, address, gstin, type }));
      setEditMode(false);
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (err) {
      setSaveMsg("Failed to save pricing: " + (err.message || "Unknown error"));
    }
    setSaving(false);
  };

  /* ── Delete customer (called from modal) ── */
  const handleDelete = async () => {
      // 1. Delete all transactions
      await offlineSupabase.from("transactions").delete({ id }).eq("customer_id", id);
      // 2. Delete customer record
      await offlineSupabase.from("customers").delete({ id }).eq("id", id);

    // 3. Redirect to home based on role stored in localStorage
    const role = localStorage.getItem("khata_role");
    if (role === "admin") {
      navigate("/admin/home");
    } else {
      navigate("/employee/home");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)] text-lg animate-pulse">Loading profile…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--danger)] text-lg">{loadError}</div>
      </div>
    );
  }

  const initials = getInitials(name || customer?.name);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] relative overflow-hidden select-none animate-fade-in">
      <div className="relative z-10 bg-[var(--surface)] border-b border-[var(--border)] shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-4">
          <button
            onClick={() => navigate(`/customer/${id}`)}
            className="flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer outline-none active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Customer Profile</h1>
          <button
            onClick={() => {
              if (editMode) handleSave();
              else setEditMode(true);
            }}
            disabled={saving}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer outline-none active:scale-95 ${
              editMode
                ? "bg-[var(--primary)] text-white font-bold shadow-md shadow-[var(--primary)]/10 hover:bg-[var(--primary-hover)]"
                : "bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text-primary)]"
            }`}
          >
            {editMode ? (saving ? "Saving…" : "Save") : "Edit"}
          </button>
        </div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-24 h-24 rounded-full bg-[var(--primary-light)] border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] font-black text-3xl select-none">
            {initials || "?"}
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-2">Ledger Avatar</p>
        </div>

        <div className="rounded-3xl card overflow-hidden shadow-md">
          <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Customer Information</p>
          </div>

          <div className="divide-y divide-[var(--border)]">
            <InfoRow label="Name" editMode={editMode} value={name} onChange={setName} placeholder="Enter name" />
            <InfoRow label="Phone" editMode={editMode} value={phone} onChange={setPhone} placeholder="Enter phone number" inputMode="tel" />
            <InfoRow label="Address" editMode={editMode} value={address} onChange={setAddress} placeholder="Enter address" />
            <InfoRow label="GSTIN" editMode={editMode} value={gstin} onChange={setGstin} placeholder="Enter GSTIN" />

            <div className="flex items-center gap-4 px-6 py-4">
              <span className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest w-24 shrink-0">Type</span>
              <div className="flex gap-2">
                {["Customer", "Supplier"].map((t) => (
                  <button
                    key={t}
                    disabled={!editMode}
                    onClick={() => editMode && setType(t)}
                    className={`px-4.5 py-2 rounded-xl text-xs font-bold transition-all duration-300 uppercase tracking-wider ${
                      type.toLowerCase() === t.toLowerCase()
                        ? "bg-[var(--primary)] text-white font-bold shadow-md shadow-[var(--primary)]/10"
                        : "bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--border)]"
                    } ${!editMode ? "cursor-default opacity-80" : "cursor-pointer hover:bg-[var(--border)]/40 hover:text-[var(--text-primary)] active:scale-95"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Specific Pricing */}
        <div className="rounded-3xl card overflow-hidden shadow-md">
          <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]">
            <p className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest">Customer Specific Pricing</p>
          </div>
          {products.length === 0 ? (
            <div className="px-6 py-4 text-[var(--text-muted)] text-xs italic">No products available. Add products from catalogue first.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {products.map((product) => {
                const customVal = customPrices[product.id];
                return (
                  <div key={product.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-primary)] font-semibold text-sm truncate">{product.name}</p>
                      <p className="text-[var(--text-muted)] text-[10px] font-medium">
                        Default: <span className="text-[var(--primary)] font-bold">₹{new Intl.NumberFormat("en-IN").format(product.sale_price)}</span>
                      </p>
                    </div>
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">₹</span>
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          value={customVal !== undefined ? customVal : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomPrices((prev) => {
                              const next = { ...prev };
                              if (val === "" || Number(val) < 0) {
                                delete next[product.id];
                              } else {
                                next[product.id] = Number(val);
                              }
                              return next;
                            });
                          }}
                          placeholder="Default"
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-7 pr-3 py-2 text-[var(--text-primary)] text-xs font-bold text-right placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-200"
                        />
                      ) : (
                        <span className="block w-full text-right text-[var(--text-primary)] font-bold text-xs py-2 pr-3">
                          {customVal !== undefined ? (
                            <span className="text-[var(--primary)]">₹{new Intl.NumberFormat("en-IN").format(customVal)}</span>
                          ) : (
                            <span className="text-[var(--text-muted)] font-medium italic">Default</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {saveMsg && (
          <div
            className={`text-center text-xs font-bold uppercase tracking-wider py-4.5 rounded-2xl border ${
              saveMsg.startsWith("Failed")
                ? "text-[var(--danger)] bg-[var(--danger-light)] border border-[var(--danger)]/20"
                : "text-[var(--success)] bg-[var(--success-light)] border border-[var(--success)]/20 animate-pulse-soft"
            }`}
          >
            {saveMsg}
          </div>
        )}

        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full py-4 rounded-2xl bg-[var(--secondary)] border border-[var(--danger)]/20 text-[var(--danger)] font-black tracking-widest uppercase text-xs hover:bg-[#fcd5dc] hover:border-[var(--danger)]/40 transition-all duration-200 active:scale-[0.98] cursor-pointer outline-none shadow-sm mt-4"
        >
          Delete Customer
        </button>

        <div className="h-4" />
      </div>

      {showDeleteModal && (
        <DeleteCustomerModal
          customerName={name || customer?.name}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, onChange, editMode, placeholder, inputMode }) {
  return (
    <div className="flex items-start gap-4 px-6 py-4">
      <span className="text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest w-24 shrink-0 pt-2.5">{label}</span>
      {editMode ? (
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all duration-300 placeholder-[var(--text-muted)]"
        />
      ) : (
        <span className="flex-1 text-[var(--text-primary)] font-semibold text-sm pt-1 pb-1">
          {value || <span className="text-[var(--text-muted)] font-medium italic">Not set</span>}
        </span>
      )}
    </div>
  );
}

export default CustomerProfile;

