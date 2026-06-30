import { offlineSupabase } from "./offline/offlineSupabase";
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
    if (importHistoryId) rpcPayload.p_import_history_id = importHistoryId;
    const { data, error } = await supabase.rpc("create_gave_transaction", rpcPayload);
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
