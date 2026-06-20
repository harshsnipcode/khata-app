import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import db, { getRecycleBin, restoreFromRecycleBin, permanentlyDeleteFromRecycleBin, cleanupRecycleBin } from "../lib/offline/db";

function getEntityIcon(type) {
  switch (type) {
    case "transactions": return "💳";
    case "customers": return "👤";
    case "products": return "📦";
    default: return "📄";
  }
}

function getEntityLabel(type) {
  switch (type) {
    case "transactions": return "Transaction";
    case "customers": return "Customer";
    case "products": return "Product";
    default: return "Unknown";
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  if (hrs > 0) return `${hrs}h ago`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m ago`;
}

function RecycleBinPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const loadItems = async () => {
    setLoading(true);
    const data = await getRecycleBin();
    // Sort by deleted_at descending
    data.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    // Run cleanup on mount
    cleanupRecycleBin();
  }, []);

  const handleRestore = async (local_uuid) => {
    console.log(`[RecycleBin] === START RESTORE FLOW === local_uuid: ${local_uuid}`);

    // ── STEP 1: Read raw recycle bin entry BEFORE restore (since restore deletes it) ──
    let rawOriginalData = null;
    let entityType = "transactions";
    let rawItemDebug = {};
    try {
      const rawItem = await db.table('recycle_bin').get(local_uuid);
      console.log("RAW RECYCLE ITEM");
      console.log(rawItem);
      if (rawItem) {
        entityType = rawItem.entity_type;
        rawItemDebug = { ...rawItem };
        delete rawItemDebug.original_data;
        rawOriginalData = JSON.parse(rawItem.original_data);
        console.log("RAW ORIGINAL DATA");
        console.log(rawOriginalData);
        console.log(`[RecycleBin] STEP 1 — Raw recycle bin item:`, {
          ...rawItemDebug,
          originalDataParsed: { ...rawOriginalData },
          originalDataCustomerId: rawOriginalData.customer_id,
          originalDataCustomerIdType: typeof rawOriginalData.customer_id,
          originalDataHasCustomerId: 'customer_id' in rawOriginalData,
        });
      } else {
        console.error(`[RecycleBin] STEP 1 — Raw recycle bin item NOT FOUND for local_uuid: ${local_uuid}`);
      }
    } catch (e) {
      console.error('[RecycleBin] STEP 1 — Failed to read raw recycle bin data:', e);
    }

    // ── STEP 2: Run restoreFromRecycleBin ──
    const result = await restoreFromRecycleBin(local_uuid);
    console.log("RESTORED DATA");
    console.log(result.data);
    console.log(`[RecycleBin] STEP 2 — restoreFromRecycleBin result:`, {
      success: result.success,
      entityType: result.entityType,
      restoredKeys: result.data ? Object.keys(result.data) : null,
      restoredCustomerId: result.data?.customer_id,
      restoredCustomerIdType: typeof result.data?.customer_id,
      restoredHasCustomerId: result.data ? ('customer_id' in result.data) : null,
    });

    if (result.success) {
      // ── STEP 3: Choose data source for server upsert ──
      // Handle new wrapper format: { transaction: {...}, transaction_items: [...] }
      let rawTransactionData = rawOriginalData;
      if (rawTransactionData && rawTransactionData.transaction) {
        rawTransactionData = rawTransactionData.transaction;
      }
      let dataForServer = rawTransactionData || result.data;
      console.log(`[RecycleBin] STEP 3 — dataForServer choice:`, {
        usingRaw: !!rawOriginalData,
        usingWrappedFormat: !!(rawOriginalData && rawOriginalData.transaction),
        dataForServerKeys: Object.keys(dataForServer),
        dataForServerCustomerId: dataForServer.customer_id,
        dataForServerCustomerIdType: typeof dataForServer.customer_id,
        dataForServerHasCustomerId: 'customer_id' in dataForServer,
        dataForServerId: dataForServer.id,
        fullObject: JSON.parse(JSON.stringify(dataForServer)),
      });

      // ── STEP 4: Strip Dexie-only fields and build cleanData ──
      const { local_uuid: _, synced, created_offline, id, ...cleanRest } = dataForServer;
      const cleanData = { id, ...cleanRest };

      console.log(`[RecycleBin] STEP 4 — cleanData (before upsert):`, {
        cleanDataKeys: Object.keys(cleanData),
        cleanDataCustomerId: cleanData.customer_id,
        cleanDataCustomerIdType: typeof cleanData.customer_id,
        cleanDataHasCustomerId: 'customer_id' in cleanData,
        cleanDataId: cleanData.id,
        fullObject: JSON.parse(JSON.stringify(cleanData)),
      });

      // ── STEP 5: Upsert to Supabase ──
      console.log("FINAL UPSERT PAYLOAD");
      console.log(JSON.stringify(cleanData, null, 2));
      console.log(`[RecycleBin] STEP 5 — Calling supabase.from("${entityType}").upsert(..., { onConflict: 'id' })`);
      const { error: serverError } = await supabase
        .from(entityType)
        .upsert(cleanData, { onConflict: 'id' });

      if (serverError) {
        console.error(`[RecycleBin] STEP 5 — Supabase upsert FAILED:`, {
          message: serverError.message,
          details: serverError.details,
          code: serverError.code,
          hint: serverError.hint,
        });
      } else {
        console.log(`[RecycleBin] STEP 5 — Supabase upsert SUCCEEDED for ${entityType} id=${cleanData.id}`);

        // ── STEP 6: Upsert transaction_items to Supabase ──
        const transactionItems = (rawOriginalData && rawOriginalData.transaction_items) || result.transaction_items;
        if (transactionItems && transactionItems.length > 0) {
          console.log(`[RecycleBin] STEP 6 — Upserting ${transactionItems.length} transaction_item(s) to Supabase`);
          const cleanItems = transactionItems.map(item => {
            const { local_uuid: _, synced, created_offline, products, ...rest } = item;
            return rest;
          });
          const { error: itemsError } = await supabase
            .from("transaction_items")
            .upsert(cleanItems, { onConflict: 'id' });
          if (itemsError) {
            console.error(`[RecycleBin] STEP 6 — transaction_items upsert FAILED:`, itemsError);
          } else {
            console.log(`[RecycleBin] STEP 6 — ${cleanItems.length} transaction_item(s) upserted SUCCEEDED`);
          }
        } else {
          console.log(`[RecycleBin] STEP 6 — No transaction_items to restore`);
        }
      }

      setActionMsg("Item restored successfully!");
      await loadItems();
      setTimeout(() => setActionMsg(""), 2500);
    } else {
      console.error(`[RecycleBin] Dexie restore failed:`, result.error);
      setActionMsg("Failed to restore: " + (result.error || "Unknown error"));
    }
  };

  const handlePermanentDelete = async (local_uuid) => {
    const result = await permanentlyDeleteFromRecycleBin(local_uuid);
    if (result.success) {
      setActionMsg("Item permanently deleted.");
      setConfirmDelete(null);
      await loadItems();
      setTimeout(() => setActionMsg(""), 2500);
    } else {
      setActionMsg("Failed to delete: " + (result.error || "Unknown error"));
    }
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
          <div className="text-[var(--text-secondary)] text-[8px] font-black uppercase tracking-wider">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </div>
        </div>

        <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Recycle Bin
        </h1>

        {actionMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold p-3 rounded-xl text-center">
            {actionMsg}
          </div>
        )}

        {loading ? (
          <div className="card rounded-2xl p-8 text-center">
            <div className="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-black animate-pulse">Loading...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="card rounded-2xl py-12 text-center space-y-3 shadow-sm">
            <div className="text-4xl">🗑</div>
            <p className="text-[var(--text-secondary)] font-bold text-sm">Recycle bin is empty</p>
            <p className="text-[var(--text-muted)] text-[10px] font-medium max-w-xs mx-auto">
              Deleted customers, products, and transactions will appear here. You can restore them within 90 days.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isExpired = new Date(item.restore_deadline) < new Date();
              const originalData = item.original_data || {};
              const amount = originalData?.amount;

              return (
                <div
                  key={item.local_uuid}
                  className={`card rounded-2xl px-4 py-3 shadow-sm border-l-4 ${
                    isExpired ? "border-l-[var(--text-muted)] opacity-60" : "border-l-emerald-500/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl mt-0.5">{getEntityIcon(item.entity_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {item.entity_name}
                        </p>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                          item.entity_type === "transactions" ? "bg-[var(--secondary)] text-[var(--danger)]" :
                          item.entity_type === "customers" ? "bg-[var(--primary-light)] text-[var(--primary)]" :
                          "bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]"
                        }`}>
                          {getEntityLabel(item.entity_type)}
                        </span>
                      </div>

                      {amount && (
                        <p className="text-[11px] font-bold text-[var(--danger)] mt-0.5">
                          ₹{new Intl.NumberFormat("en-IN").format(Math.round(amount))}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-[9px] text-[var(--text-muted)] font-medium">
                          Deleted {timeAgo(item.deleted_at)}
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] font-medium">
                          by {item.deleted_by}
                        </p>
                      </div>

                      {isExpired && (
                        <p className="text-[9px] text-[var(--danger)] font-bold mt-1 uppercase tracking-wider">
                          Restore deadline passed
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isExpired && (
                        <button
                          onClick={() => handleRestore(item.local_uuid)}
                          className="w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition active:scale-90 cursor-pointer outline-none"
                          title="Restore"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(confirmDelete === item.local_uuid ? null : item.local_uuid)}
                        className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition active:scale-90 cursor-pointer outline-none"
                        title="Permanently delete"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {confirmDelete === item.local_uuid && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
                      <p className="text-[9px] text-[var(--danger)] font-bold flex-1">
                        Permanently delete this item?
                      </p>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--border)] transition cursor-pointer outline-none"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item.local_uuid)}
                        className="text-[9px] font-bold text-white bg-[var(--danger)] px-3 py-1.5 rounded-lg hover:bg-[#d45a3d] transition cursor-pointer outline-none"
                      >
                        Delete Forever
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <p className="text-[8px] text-[var(--text-muted)] text-center font-medium pb-2">
            Items are automatically deleted after 90 days
          </p>
        )}
      </div>
    </div>
  );
}

export default RecycleBinPage;
