import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function ProductGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadGroups = async () => {
    const { data, error } = await offlineSupabase
      .from("product_groups")
      .select("*")
      .order("name", { ascending: true });
    if (error) setMessage(error.message || "Unable to load product groups.");
    else setGroups(data || []);
  };

  useEffect(() => {
    loadGroups();
    const channel = offlineSupabase
      .channel("product-groups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_groups" }, () => loadGroups())
      .subscribe();
    return () => { offlineSupabase.removeChannel(channel); };
  }, []);

  const resetForm = () => {
    setGroupName("");
    setEditingId(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setMessage("Enter a group name.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (editingId) {
        const { error } = await offlineSupabase
          .from("product_groups")
          .update({ name, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (error) throw error;
        setMessage("Group updated.");
      } else {
        const { error } = await offlineSupabase
          .from("product_groups")
          .insert([{ name }]);
        if (error) throw error;
        setMessage("Group created.");
      }
      resetForm();
      await loadGroups();
    } catch (error) {
      setMessage(error.message || "Unable to save group.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (group) => {
    setEditingId(group.id);
    setGroupName(group.name);
    setMessage("");
  };

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete "${group.name}"? Products in this group will move to No Group.`)) return;
    setSaving(true);
    setMessage("");
    try {
      const { error: productError } = await offlineSupabase
        .from("products")
        .update({ group_id: null })
        .eq("group_id", group.id);
      if (productError) throw productError;

      const { error } = await offlineSupabase
        .from("product_groups")
        .delete()
        .eq("id", group.id);
      if (error) throw error;

      if (editingId === group.id) resetForm();
      setMessage("Group deleted.");
      await loadGroups();
    } catch (error) {
      setMessage(error.message || "Unable to delete group.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] px-4 py-3 select-none animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-4">
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

        <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Product Groups
        </h1>

        <form onSubmit={handleSave} className="card rounded-2xl px-4 py-4 shadow-sm space-y-3">
          <div>
            <label className="block text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider mb-1">Group Name</label>
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
              placeholder="e.g. Amul Products"
            />
          </div>
          <div className="flex gap-2 justify-end">
            {editingId && (
              <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
                Cancel
              </button>
            )}
            <button disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>

        {message && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">
            {message}
          </div>
        )}

        <div className="space-y-2">
          {groups.length === 0 ? (
            <div className="card rounded-2xl py-8 text-center text-sm font-bold text-[var(--text-secondary)]">
              No product groups yet.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="card rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between gap-3">
                <p className="font-bold text-sm text-[var(--text-primary)] truncate">{group.name}</p>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleEdit(group)} className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(group)} className="px-3 py-1.5 rounded-xl bg-[var(--secondary)] border border-[var(--danger)]/20 text-xs font-bold text-[var(--danger)] cursor-pointer">
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductGroupsPage;
