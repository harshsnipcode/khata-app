import { useState, useEffect, useMemo } from "react";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import ProductCard from "./ProductCard";
import SearchBar from "./SearchBar";
import ProductFilterModal from "./ProductFilterModal";
import { useNavigate } from "react-router-dom";
import { can } from "../lib/permissions";

function CatalogueView({ isAdmin }) {
  const canAddProduct = isAdmin || can("add_product");
  const canViewReport = isAdmin || can("view_reports");
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortType, setSortType] = useState("recent");
  const [showFilter, setShowFilter] = useState(false);
  const [pendingFilter, setPendingFilter] = useState("all");
  const [pendingSort, setPendingSort] = useState("recent");

  const loadProducts = async () => {
    setLoading(true);
    const [prodRes, groupRes] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("product_groups").select("id, name"),
    ]);
    if (!prodRes.error) setProducts(prodRes.data || []);
    if (!groupRes.error) setGroups(groupRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();

    const handleInventoryUpdated = () => loadProducts();
    window.addEventListener("inventory-updated", handleInventoryUpdated);

    const channel = supabase
      .channel("catalogue-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_groups" }, () => loadProducts())
      .subscribe();

    return () => {
      window.removeEventListener("inventory-updated", handleInventoryUpdated);
      supabase.removeChannel(channel);
    };
  }, []);

  const totals = useMemo(() => {
    let totalValue = 0;
    let lowStockCount = 0;
    products.forEach((p) => {
      totalValue += Number(p.stock_quantity) * Number(p.sale_price);
      if (Number(p.stock_quantity) <= Number(p.low_stock_limit)) lowStockCount++;
    });
    return { totalValue, lowStockCount };
  }, [products]);

  const groupMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => { map[g.id] = g.name; });
    return map;
  }, [groups]);

  const groupedProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterType === "low" && Number(p.stock_quantity) > Number(p.low_stock_limit)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortType === "recent") return new Date(b.created_at) - new Date(a.created_at);
      if (sortType === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortType === "highest") return Number(b.stock_quantity) - Number(a.stock_quantity);
      if (sortType === "lowest") return Number(a.stock_quantity) - Number(b.stock_quantity);
      if (sortType === "az") return a.name.localeCompare(b.name);
      return 0;
    });

    const groupOrder = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    const buckets = {};
    groupOrder.forEach((g) => { buckets[g.id] = []; });
    buckets["_ungrouped"] = [];

    list.forEach((p) => {
      if (p.group_id && buckets[p.group_id]) {
        buckets[p.group_id].push(p);
      } else {
        buckets["_ungrouped"].push(p);
      }
    });

    const result = [];
    groupOrder.forEach((g) => {
      if (buckets[g.id].length > 0) {
        result.push({ type: "header", groupId: g.id, name: g.name });
        buckets[g.id].forEach((p) => result.push({ type: "product", product: p }));
      }
    });
    if (buckets["_ungrouped"].length > 0) {
      result.push({ type: "header", groupId: "_ungrouped", name: "Ungrouped" });
      buckets["_ungrouped"].forEach((p) => result.push({ type: "product", product: p }));
    }

    return result;
  }, [products, groups, searchTerm, filterType, sortType]);

  const activeFilterCount = (filterType !== "all" ? 1 : 0) + (sortType !== "recent" ? 1 : 0);

  const applyFilter = () => {
    setFilterType(pendingFilter);
    setSortType(pendingSort);
    setShowFilter(false);
  };

  return (
    <div className="space-y-6">
      {/* Catalogue Summary Card */}
        <div className="grid grid-cols-2 gap-4" style={{ containerType: "inline-size" }}>
        <div className="card rounded-3xl p-6 shadow-md">
          <p className="text-[var(--text-secondary)] text-xs uppercase tracking-widest mb-2 font-bold">Total Stock Value</p>
          <h2 className="text-[var(--text-primary)] font-black [font-size:clamp(0.875rem,7cqw,1.875rem)]">₹{new Intl.NumberFormat("en-IN").format(totals.totalValue)}</h2>
          {canViewReport && (
            <button onClick={() => navigate('/catalogue/reports')} className="mt-3 text-[var(--primary)] text-xs font-bold uppercase tracking-[0.2em] hover:text-[var(--primary-hover)] transition cursor-pointer">View Reports ›</button>
          )}
        </div>
        <div className="card rounded-3xl p-6 shadow-md">
          <p className="text-[var(--text-secondary)] text-xs uppercase tracking-widest mb-2 font-bold">Low Stock Items</p>
          <h2 className={`font-black [font-size:clamp(0.875rem,7cqw,1.875rem)] ${totals.lowStockCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{totals.lowStockCount} Items</h2>
          <button onClick={() => setFilterType("low")} className="mt-3 text-[var(--danger)] text-xs font-bold uppercase tracking-[0.2em] hover:text-[var(--danger)]/80 transition">Show Items ›</button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4 items-center">
          <div className="bg-[var(--background)] rounded-2xl border border-[var(--border)] p-1 flex-1">
            <div className="py-2 text-sm font-bold bg-[var(--surface)] text-[var(--primary)] border border-[var(--border)] rounded-xl shadow-sm text-center">PRODUCTS</div>
          </div>
          {canAddProduct && (
            <button 
              onClick={() => navigate('/catalogue/add')}
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold px-6 py-3 rounded-2xl transition shadow-sm text-sm whitespace-nowrap cursor-pointer"
            >
              + ADD PRODUCT
            </button>
          )}
        </div>

        <SearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onOpenFilter={() => { setPendingFilter(filterType); setPendingSort(sortType); setShowFilter(true); }}
          activeCount={activeFilterCount}
          showPreview={true}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-[var(--text-secondary)] font-bold animate-pulse uppercase tracking-widest">Loading Catalogue...</div>
        ) : groupedProducts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-[var(--text-secondary)] card border-dashed rounded-3xl">
            <p className="font-bold uppercase tracking-widest">No Products Found</p>
            <p className="text-sm mt-1">Try a different search or filter</p>
          </div>
        ) : (
          groupedProducts.map((item, idx) =>
            item.type === "header" ? (
              <div key={`group-${item.groupId}`} className="col-span-full mt-2 first:mt-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-[var(--text-primary)] font-black text-sm uppercase tracking-widest">{item.name}</h3>
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
              </div>
            ) : (
              <ProductCard key={item.product.id} product={item.product} isAdmin={isAdmin} groupName={groupMap[item.product.group_id] || null} />
            )
          )
        )}
      </div>

      {showFilter && (
        <ProductFilterModal
          selectedFilter={pendingFilter}
          setSelectedFilter={setPendingFilter}
          selectedSort={pendingSort}
          setSelectedSort={setPendingSort}
          onApply={applyFilter}
          onClose={() => setShowFilter(false)}
        />
      )}
    </div>
  );
}

export default CatalogueView;
