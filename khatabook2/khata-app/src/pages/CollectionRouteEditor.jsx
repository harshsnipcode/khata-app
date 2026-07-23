import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { offlineSupabase, offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id, customer, index, isDragging }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: itemDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: itemDragging ? 0.4 : 1,
    zIndex: itemDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card rounded-xl px-3.5 py-3 flex items-center gap-3 touch-none select-none ${
        itemDragging ? "shadow-2xl scale-[1.03]" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {/* Drag Handle */}
      <div className="shrink-0 text-[var(--text-muted)] opacity-40">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>

      {/* Route number */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
        style={{ background: "#ebf6f5", color: "#5cbdb9" }}
      >
        {index + 1}
      </div>

      {/* Customer avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
        style={{ background: "#ebf6f5", color: "#5cbdb9" }}
      >
        {(customer.name?.[0] || "?").toUpperCase()}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "#2d3436" }}>
          {customer.name}
        </p>
        <p className="text-[10px] font-medium text-[var(--text-muted)]">
          Position #{index + 1}
        </p>
      </div>
    </div>
  );
}

function CollectionRouteEditor() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const saveTimeoutRef = useRef(null);
  const pendingOrderRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 800, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 800, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const getHomePath = () => {
    const r = localStorage.getItem("khata_role");
    if (r === "admin") return "/admin/home";
    if (r === "employee") return "/employee/home";
    return "/";
  };

  const persistOrder = async (orderedCustomers) => {
    setSaving(true);
    try {
      const updates = orderedCustomers.map((c, i) =>
        offlineSupabase
          .from("customers")
          .update({ route_position: i + 1 })
          .eq("id", c.id),
      );
      await Promise.all(updates);
    } catch (err) {
      console.error("Failed to save order", err);
      await load();
    }
    setSaving(false);
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    setCustomers((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        persistOrder(reordered);
      }, 300);

      return reordered;
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
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
            Long press and drag to reorder customers
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={customers.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {customers.map((customer, index) => (
                  <SortableItem
                    key={customer.id}
                    id={customer.id}
                    customer={customer}
                    index={index}
                    isDragging={activeId === customer.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

export default CollectionRouteEditor;
