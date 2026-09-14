import { offlineSupabase } from "./offline/offlineSupabase";
import { moveCustomerToCollectionQueueEnd } from "./collectionQueue";
import { loadSavedTemplate, fillTemplate } from "./reminderTemplate";
import { getLedgerLink } from "./appUrl";

function openSmsComposer(phone, text) {
  if (typeof window === "undefined") return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = isIOS
    ? `sms:${phone}&body=${encodeURIComponent(text)}`
    : `sms:${phone}?body=${encodeURIComponent(text)}`;
  const smsWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!smsWindow) window.location.href = url;
}

export async function runPostTransactionSaveTasks({
  customerId,
  customer,
  client = offlineSupabase,
  loadTemplate = loadSavedTemplate,
  renderTemplate = fillTemplate,
  moveToQueueEnd = moveCustomerToCollectionQueueEnd,
  openSms = openSmsComposer,
  buildLedgerLink = getLedgerLink,
  storage = typeof localStorage === "undefined" ? null : localStorage,
} = {}) {
  const { data: collectionSettings } = await client
    .from("business_settings")
    .select("settings")
    .limit(1)
    .maybeSingle();

  if (collectionSettings?.settings?.collection_mode_enabled) {
    moveToQueueEnd(customerId);
  }

  await client.from("customers").update({ updated_at: new Date().toISOString() }).eq("id", customerId);

  if (!customer?.auto_sms_enabled || !customer?.phone) return;

  const { data: allTxns } = await client
    .from("transactions")
    .select("type, amount")
    .eq("customer_id", customerId);
  let gave = 0;
  let got = 0;
  (allTxns || []).forEach((transaction) => {
    if (transaction.type === "gave") gave += Number(transaction.amount);
    else got += Number(transaction.amount);
  });
  const balance = gave - got;
  const template = await loadTemplate();
  const text = renderTemplate(template, {
    customerName: customer.name,
    balance: Math.abs(balance),
    balanceType: balance >= 0 ? "You Will Get" : "You Will Give",
    ledgerLink: buildLedgerLink(customerId),
    businessName: storage?.getItem("khata_business_name") || "Shiv Shankar Dairy",
  });
  const phone = customer.phone.replace(/[^0-9]/g, "");
  if (phone) openSms(phone, text);
}
