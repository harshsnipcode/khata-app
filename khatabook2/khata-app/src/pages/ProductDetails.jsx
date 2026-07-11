import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { offlineSupabase as supabase } from "../lib/offline/offlineSupabase";
import { can } from "../lib/permissions";

function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);

  const getHomePath = () => {
    const role = localStorage.getItem("khata_role");
    if (role === "admin") return "/admin/home";
    if (role === "employee") return "/employee/home";
    return "/home";
  };
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [pRes, tRes] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).single(),
      supabase.from("product_transactions").select("*").eq("product_id", id).order("created_at", { ascending: false })
    ]);
    if (!pRes.error) setProduct(pRes.data);
    if (!tRes.error) setTransactions(tRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`product-details-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `id=eq.${id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_transactions", filter: `product_id=eq.${id}` }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const stats = useMemo(() => {
    if (!product) return {};
    const stockValue = Number(product.stock_quantity) * Number(product.purchase_price);
    return { stockValue };
  }, [product]);

  if (loading) return <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--text-secondary)] font-bold uppercase tracking-widest animate-pulse">Loading Product...</div>;
  if (!product) return <div className="min-h-screen bg-[var(--background)] p-6 text-[var(--danger)] font-bold">Product Not Found</div>;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(getHomePath(), { replace: true, state: { activeTab: "catalogue" } })}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            ← Back
          </button>
          {can("edit_product") && (
            <button onClick={() => navigate(`/product/${product.id}/edit`)} className="bg-[var(--surface)] border border-[var(--border)] px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:border-[var(--border-hover)] text-[var(--text-primary)] transition">Edit Product</button>
          )}
        </div>

        {/* Product Header Card */}
        <div className="card rounded-3xl p-6 shadow-md flex gap-6 items-center">
          <div className="w-24 h-24 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center text-4xl shrink-0">
             {product.image_url ? <img src={product.image_url} alt={product.name} /> : "📦"}
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)]">{product.name}</h1>
            <p className="text-[var(--text-secondary)] font-bold mt-1">Product ID #{product.id}</p>
            <div className="flex gap-2 mt-2">
              <span className="bg-[var(--primary-light)] text-[var(--primary)] text-[10px] font-black px-2 py-1 rounded border border-[var(--primary)]/20 uppercase tracking-widest">Active</span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="card rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase font-black mb-1">Sale Price</p>
            <p className="text-xl font-black">₹{product.sale_price}</p>
          </div>
          <div className="card rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase font-black mb-1">Purchase Price</p>
            <p className="text-xl font-black">₹{product.purchase_price}</p>
          </div>
          <div className="card rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase font-black mb-1">Stock Quantity</p>
            <p className={`text-xl font-black ${product.stock_quantity <= product.low_stock_limit ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
              {product.stock_quantity} {product.unit}
            </p>
          </div>
           <div className="card rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[var(--text-secondary)] text-[10px] uppercase font-black mb-1">Stock Value</p>
            <p className="text-xl font-black">₹{new Intl.NumberFormat("en-IN").format(stats.stockValue)}</p>
          </div>
        </div>

        {can("stock_entry") && (
          <div className="grid grid-cols-2 gap-4">
             <button 
               onClick={() => navigate(`/product/${product.id}/stock-in`)}
               className="bg-[var(--primary-light)] border border-[var(--primary)]/20 hover:bg-[#d5eded] py-4 rounded-2xl text-[var(--primary)] font-black uppercase tracking-[0.2em] transition"
             >
               Stock In (+ IN)
             </button>
             <button 
               onClick={() => navigate(`/product/${product.id}/stock-out`)}
               className="bg-[var(--secondary)] border border-[var(--danger)]/20 hover:bg-[#fcd5dc] py-4 rounded-2xl text-[var(--danger)] font-black uppercase tracking-[0.2em] transition"
             >
               Stock Out (- OUT)
             </button>
          </div>
        )}

        {/* History Section */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text-primary)]">Stock History</h2>
          <div className="space-y-3">
             {transactions.length === 0 ? (
               <div className="card border-dashed rounded-3xl p-12 text-center text-[var(--text-secondary)] font-bold uppercase tracking-widest">No transactions for this product</div>
             ) : (
               transactions.map(t => (
                 <div key={t.id} className="card rounded-2xl p-4 flex items-center justify-between hover:card-hover transition shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${t.type === 'stock_in' ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'bg-[var(--secondary)] text-[var(--danger)]'}`}>
                        {t.type === 'stock_in' ? '↑' : '↓'}
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)] uppercase text-sm">{t.type === 'stock_in' ? 'Stock In' : 'Stock Out'}</p>
                        <p className="text-[var(--text-secondary)] text-xs font-medium">{new Date(t.created_at).toLocaleDateString()} · {t.notes || 'No notes'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className={`font-black text-lg ${t.type === 'stock_in' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                         {t.type === 'stock_in' ? '+' : '-'}{t.quantity} {product.unit}
                       </p>
                       <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest">Rate: ₹{t.price}</p>
                    </div>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetails;
