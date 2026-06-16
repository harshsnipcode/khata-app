import { saveFetchedData, addOfflineRecord } from './db';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nqciyviiizulkaipwwbi.supabase.co';
const KNOWN_TABLES = new Set([
  'customers', 'transactions', 'products', 'product_transactions',
  'transaction_items', 'customer_product_prices', 'employees', 'employee_attendance'
]);

function extractTableFromUrl(url) {
  try {
    const u = new URL(url, location.href);
    const m = u.pathname.match(/\/rest\/v1\/(\w+)/);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

export function initFetchInterceptor() {
  if (typeof window === 'undefined') return;
  if (window.__khata_fetch_interceptor_installed) return;
  window.__khata_fetch_interceptor_installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init = {}) {
    const req = typeof input === 'string' ? input : input.url || '';
    try {
      // If this is a Supabase REST GET, allow network first then cache
      if (req.startsWith(SUPABASE_URL) && init.method !== 'POST' && init.method !== 'PUT' && init.method !== 'PATCH' && init.method !== 'DELETE') {
        const response = await originalFetch(input, init);
        try {
          if (response && response.ok) {
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const clone = response.clone();
              const json = await clone.json();
              const table = extractTableFromUrl(req);
              if (table && KNOWN_TABLES.has(table) && json) {
                const rows = Array.isArray(json) ? json : [json];
                await saveFetchedData(table, rows);
              }
            }
          }
        } catch (e) {
          // Silently ignore caching errors
        }
        return response;
      }

      // For write operations to Supabase REST when offline: queue them
      if (req.startsWith(SUPABASE_URL) && !navigator.onLine && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH' || init.method === 'DELETE')) {
        let payload = null;
        try {
          if (init.body) payload = JSON.parse(init.body);
        } catch (e) { payload = null }
        const table = extractTableFromUrl(req) || 'unknown';
        if (!KNOWN_TABLES.has(table)) return originalFetch(input, init);
        const record = payload || {};
        const result = await addOfflineRecord(table, record, init.method || 'POST');
        window.dispatchEvent(new CustomEvent('offline-saved', { detail: { message: 'Saved offline. Will sync automatically.', local_uuid: result.local_uuid, table } }));
        const fakeResponseBody = Array.isArray(record) ? record : [ { ...record, local_uuid: result.local_uuid } ];
        const blob = new Blob([JSON.stringify(fakeResponseBody)], { type: 'application/json' });
        return new Response(blob, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });
      }

      return originalFetch(input, init);
    } catch (e) {
      return originalFetch(input, init);
    }
  };
}
