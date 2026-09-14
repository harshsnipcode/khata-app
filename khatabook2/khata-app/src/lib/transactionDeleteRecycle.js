import { offlineSupabase } from "./offline/offlineSupabase";

export async function loadTransactionRecyclePayload({
  transactionId,
  currentTransaction,
  client = offlineSupabase,
} = {}) {
  const [transactionResult, itemsResult] = await Promise.all([
    client
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single(),
    client
      .from("transaction_items")
      .select("*")
      .eq("transaction_id", transactionId),
  ]);

  const fullTransaction = transactionResult.data || currentTransaction;
  return {
    fullTransaction,
    transactionItems: itemsResult.data || [],
    transactionToStore: {
      transaction: fullTransaction,
      transaction_items: itemsResult.data || [],
    },
    error: transactionResult.error || itemsResult.error || null,
  };
}

