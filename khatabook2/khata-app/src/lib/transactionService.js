import { offlineSupabase } from "./offline/offlineSupabase";
import { saveFetchedData } from "./offline/db";
import { supabase } from "./supabase";

/**
 * Persist a "You Gave" transaction through the same path used by manual entry.
 * Keeping this in one place prevents bulk imports and the transaction form from
 * drifting apart as ledger behaviour evolves.
 */
export async function createGaveTransaction({
  customerId,
  items,
  amount,
  createdBy,
  createdAt,
  importHistoryId,
  description,
}) {
  const normalizedItems = (items || []).map((item) => ({
    product: item.product,
    quantity: Number(item.quantity),
    price: Number(item.price),
  }));

  const calculatedAmount = normalizedItems.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );
  const transactionAmount = amount === undefined ? calculatedAmount : Number(amount);
  const transactionDescription = String(description ?? "").trim() || null;

  // The migration provides an atomic server-side implementation. It keeps the
  // exact same tables and payload shape while reducing a transaction from
  // several network round trips to one. Older databases safely use the legacy
  // path below until the migration has been applied.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    const rpcPayload = {
      p_customer_id: Number(customerId),
      p_items: normalizedItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.price,
      })),
      p_amount: transactionAmount,
      p_created_by: createdBy,
      p_created_at: createdAt || new Date().toISOString(),
    };
    if (transactionDescription) rpcPayload.p_description = transactionDescription;
    const rpcName = importHistoryId ? "create_import_gave_transaction" : "create_gave_transaction";
    if (importHistoryId) rpcPayload.p_import_history_id = importHistoryId;
    const { data, error } = await supabase.rpc(rpcName, rpcPayload);
    const missingFunction = error && (error.code === "PGRST202" || error.code === "42883");
    if (!error) {
      normalizedItems.forEach((item) => {
        item.product.stock_quantity = Number(item.product.stock_quantity) - item.quantity;
      });
      return Array.isArray(data) ? data[0] : data;
    }
    if (!missingFunction) throw error;
    if (importHistoryId) {
      throw new Error("Import Batch Reversal is not configured. Run db/extend_import_history_batch_reversal.sql in Supabase first.");
    }
  }

  const { data: transaction, error: transactionError } = await offlineSupabase
    .from("transactions")
    .insert([{
      customer_id: Number(customerId),
      type: "gave",
      amount: transactionAmount,
      description: transactionDescription,
      created_by: createdBy,
      created_at: createdAt || new Date().toISOString(),
    }])
    .select()
    .single();

  if (transactionError) throw transactionError;

  if (normalizedItems.length > 0) {
    const transactionItems = normalizedItems.map((item) => ({
      transaction_id: transaction.id,
      product_id: item.product.id,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemError } = await offlineSupabase
      .from("transaction_items")
      .insert(transactionItems);
    if (itemError) throw itemError;

    for (const item of normalizedItems) {
      const newStock = Number(item.product.stock_quantity) - item.quantity;
      const { error: stockError } = await offlineSupabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", item.product.id);
      if (stockError) throw stockError;

      // Bulk imports can reuse the loaded product object safely without
      // re-fetching it after every transaction.
      item.product.stock_quantity = newStock;
    }
  }

  return transaction;
}

export async function updateGaveTransaction({
  transactionId,
  items,
  amount,
  createdAt,
  originalItems,
  description,
}) {
  const normalizedItems = (items || []).map((item) => ({
    product: item.product,
    quantity: Number(item.quantity),
    price: Number(item.price),
  }));

  const calculatedAmount = normalizedItems.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );
  const transactionAmount = amount === undefined ? calculatedAmount : Number(amount);
  const transactionDescription = String(description ?? "").trim() || null;

  // Calculate stock deltas: +original items (restore) and -new items (deduct)
  const stockDeltas = {};
  for (const orig of (originalItems || [])) {
    stockDeltas[orig.product_id] = (stockDeltas[orig.product_id] || 0) + Number(orig.quantity);
  }
  for (const item of normalizedItems) {
    stockDeltas[item.product.id] = (stockDeltas[item.product.id] || 0) - item.quantity;
  }

  // Apply stock deltas
  for (const [productId, delta] of Object.entries(stockDeltas)) {
    if (delta === 0) continue;
    const { data: prod, error: fetchErr } = await offlineSupabase
      .from("products")
      .select("stock_quantity")
      .eq("id", productId)
      .single();
    if (fetchErr) throw fetchErr;
    const newStock = Number(prod.stock_quantity) + delta;
    const { error: stockErr } = await offlineSupabase
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", productId);
    if (stockErr) throw stockErr;
  }

  // Delete old transaction_items
  const { error: delErr } = await offlineSupabase
    .from("transaction_items")
    .delete()
    .eq("transaction_id", transactionId);
  if (delErr) throw delErr;

  // Insert new transaction_items
  if (normalizedItems.length > 0) {
    const transactionItems = normalizedItems.map((item) => ({
      transaction_id: transactionId,
      product_id: item.product.id,
      quantity: item.quantity,
      price: item.price,
    }));
    const { error: itemErr } = await offlineSupabase
      .from("transaction_items")
      .insert(transactionItems);
    if (itemErr) throw itemErr;
  }

  // Update transaction record
  const { error: txnErr } = await offlineSupabase
    .from("transactions")
    .update({
      amount: transactionAmount,
      description: transactionDescription,
      created_at: createdAt || new Date().toISOString(),
    })
    .eq("id", transactionId);
  if (txnErr) throw txnErr;

  return { id: transactionId };
}

export async function createProductStockAdjustment({
  product,
  type,
  quantity,
  price,
  createdBy,
  createdAt,
  notes,
  importHistoryId,
}) {
  const qtyNum = Number(quantity);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    throw new Error("Quantity must be a positive number.");
  }
  if (type !== "stock_in" && type !== "stock_out") {
    throw new Error("Invalid stock adjustment type.");
  }
  const productId = Number(product.id);
  const createdAtValue = createdAt || new Date().toISOString();
  const cleanNotes = String(notes ?? "").trim() || null;

  if (typeof navigator !== "undefined" && navigator.onLine) {
    const { data, error } = await supabase.rpc("create_product_stock_adjustment", {
      p_product_id: productId,
      p_type: type,
      p_quantity: qtyNum,
      p_price: price === undefined || price === null ? null : Number(price),
      p_notes: cleanNotes,
      p_created_by: createdBy,
      p_created_at: createdAtValue,
      p_import_history_id: importHistoryId || null,
    });

    if (error) {
      const missingFunction = error.code === "PGRST202" || error.code === "42883";
      if (missingFunction) {
        throw new Error("Atomic stock adjustment is not installed. Apply db/create_product_stock_adjustment_rpc.sql before importing stock.");
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const previousStock = Number(result?.previous_stock);
    const expectedStock = type === "stock_in"
      ? previousStock + qtyNum
      : previousStock - qtyNum;

    if (!Number.isFinite(previousStock)) {
      throw new Error("Stock adjustment returned an invalid previous stock value.");
    }

    const { data: authoritativeProduct, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();
    if (productError) throw productError;

    const persistedStock = Number(authoritativeProduct?.stock_quantity);
    if (!Number.isFinite(persistedStock) || persistedStock !== expectedStock) {
      throw new Error(`Stock verification failed for product ${productId}. Expected ${expectedStock}, found ${persistedStock}.`);
    }

    const createdTransaction = result?.product_transaction || null;
    await saveFetchedData("products", [authoritativeProduct]);
    if (createdTransaction) await saveFetchedData("product_transactions", [createdTransaction]);
    product.stock_quantity = persistedStock;

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inventory-updated", {
        detail: { productId, stockQuantity: persistedStock },
      }));
    }

    return { success: true, newStock: persistedStock, product: authoritativeProduct };
  }

  const { data: currentProduct, error: fetchError } = await offlineSupabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();
  if (fetchError) throw fetchError;

  const currentStock = Number(currentProduct.stock_quantity) || 0;
  const newStock = type === "stock_in"
    ? currentStock + qtyNum
    : currentStock - qtyNum;
  const updatedAt = new Date().toISOString();
  const transactionPayload = {
    product_id: productId,
    type,
    quantity: qtyNum,
    price: price ?? (type === "stock_in" ? currentProduct.purchase_price : currentProduct.sale_price) ?? 0,
    notes: cleanNotes,
    created_by: createdBy,
    created_at: createdAtValue,
    import_history_id: importHistoryId || null,
    stock_applied: false,
  };

  // Same lifecycle as /product/:id/stock-in: record transaction, then update stock.
  let stockTransactionId = null;
  let canMarkStockApplied = true;
  const { data: stockTransaction, error: txnError } = await offlineSupabase
    .from("product_transactions")
    .insert([transactionPayload])
    .select("id")
    .single();

  if (txnError) {
    const missingNewColumn = /import_history_id|stock_applied/i.test(String(txnError.message || ""));
    if (!missingNewColumn) throw txnError;
    canMarkStockApplied = false;
    const legacyPayload = { ...transactionPayload };
    delete legacyPayload.import_history_id;
    delete legacyPayload.stock_applied;
    const { error: legacyTxnError } = await offlineSupabase
      .from("product_transactions")
      .insert([legacyPayload]);
    if (legacyTxnError) throw legacyTxnError;
  } else {
    stockTransactionId = stockTransaction?.id || null;
  }

  const { error: stockError } = await offlineSupabase
    .from("products")
    .update({ stock_quantity: newStock, updated_at: updatedAt })
    .eq("id", productId);

  if (stockError) throw stockError;

  const updatedProduct = { ...currentProduct, stock_quantity: newStock, updated_at: updatedAt };
  await saveFetchedData("products", [updatedProduct]);
  product.stock_quantity = newStock;

  if (canMarkStockApplied && stockTransactionId) {
    const { error: markError } = await offlineSupabase
      .from("product_transactions")
      .update({ stock_applied: true })
      .eq("id", stockTransactionId);
    if (markError) throw markError;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("inventory-updated", {
      detail: { productId, stockQuantity: newStock },
    }));
  }

  return { success: true, newStock: product.stock_quantity, product: updatedProduct };
}

/**
 * Create a Stock In product transaction using the same inventory lifecycle as
 * the manual /product/:id/stock-in route.
 */
export async function createStockInAdjustment({
  product,
  quantity,
  createdBy,
  createdAt,
  notes,
  importHistoryId,
}) {
  return createProductStockAdjustment({
    product,
    type: "stock_in",
    quantity,
    createdBy,
    createdAt,
    notes,
    importHistoryId,
  });
}
