// Single source of truth for the public app URL used to build customer ledger
// links. Configure VITE_APP_URL once (e.g. in .env / Vercel project settings);
// it falls back to the current origin so local development keeps working
// without a value. Future domain changes only touch this one setting.
export function getAppUrl() {
  return String(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/, "");
}

export function getLedgerLink(customerId) {
  return `${getAppUrl()}/share/customer/${customerId}`;
}
