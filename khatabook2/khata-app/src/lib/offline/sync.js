import db, { getPendingQueue, markRecordSynced, removeQueueItem } from './db';
import { supabase } from '../supabase';

// Parents must reach the server before children that reference them.
const TABLE_PRIORITY = {
  customers: 0,
  products: 0,
  employees: 0,
  transactions: 1,
  product_transactions: 2,
  transaction_items: 2,
  customer_product_prices: 2,
  employee_attendance: 2,
};

function prepareServerPayload(payload, operation) {
  if (Array.isArray(payload)) {
    return payload.map(item => prepareServerPayload(item, operation));
  }
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  delete copy.local_uuid;
  delete copy.synced;
  delete copy.created_offline;
  delete copy.pending_operation;
  delete copy.transaction_local_uuid; // local linkage only, not a server column
  delete copy.items;                  // joined/derived data, not a server column
  delete copy.products;               // joined/derived data, not a server column

  if (operation === 'POST' || operation === 'INSERT' || operation === 'UPSERT') {
    if (copy.id === null || copy.id === undefined || copy.id === '') {
      delete copy.id;
    }
  }
  return copy;
}

// Resolve a child row's transaction_id from its parent's local_uuid after the
// parent transaction has synced and received its real server id.
async function resolveTransactionId(sourceRow) {
  if (sourceRow.transaction_id !== null && sourceRow.transaction_id !== undefined) {
    return sourceRow.transaction_id;
  }
  if (!sourceRow.transaction_local_uuid) return null;
  try {
    const parent = await db.table('transactions')
      .where('local_uuid').equals(sourceRow.transaction_local_uuid).first();
    if (parent && parent.id !== null && parent.id !== undefined) return parent.id;
  } catch (e) {
    console.error('SYNC resolveTransactionId error', e);
  }
  return null;
}

let syncRunning = false;

export async function syncPendingData() {
  if (!navigator.onLine) return;
  if (syncRunning) {
    console.log('SYNC SKIPPED — a sync run is already in progress');
    return;
  }
  syncRunning = true;
  try {
    const queue = await getPendingQueue();
    if (queue.length === 0) {
      syncRunning = false;
      return;
    }
    // IndexedDB does not preserve insertion order — sort parents before children.
    queue.sort((a, b) => {
      const pa = TABLE_PRIORITY[a.table] ?? 3;
      const pb = TABLE_PRIORITY[b.table] ?? 3;
      if (pa !== pb) return pa - pb;
      return (a.queued_at || 0) - (b.queued_at || 0);
    });
    console.log('SYNC QUEUE (start)', queue.map(q => ({ table: q.table, op: q.operation, local_uuid: q.local_uuid })));

    for (const item of queue) {
      const { local_uuid, table, operation, payload } = item;
      console.log('SYNC START', { table, operation, local_uuid });
      try {
        if (operation === 'POST' || operation === 'INSERT' || operation === 'UPSERT') {
          const cleanPayload = prepareServerPayload(payload, operation);
          const rows = Array.isArray(cleanPayload) ? cleanPayload : [cleanPayload];

          // transaction_items created offline may not know their parent's server id yet.
          if (table === 'transaction_items') {
            const sources = Array.isArray(payload) ? payload : [payload];
            let unresolved = false;
            for (let i = 0; i < rows.length; i++) {
              if (rows[i].transaction_id === null || rows[i].transaction_id === undefined) {
                const resolved = await resolveTransactionId(sources[i] || {});
                if (resolved === null) { unresolved = true; break; }
                rows[i].transaction_id = resolved;
              }
            }
            if (unresolved) {
              console.warn('SYNC DEFERRED — transaction_items parent transaction has no server id yet, leaving in queue', { local_uuid });
              continue;
            }
          }

          console.log('PAYLOAD', rows);
          const { data, error } = await supabase.from(table).insert(rows).select();
          console.log('SUPABASE RESPONSE', data);
          if (error) {
            console.error('SUPABASE ERROR', { table, operation, local_uuid, message: error.message, details: error.details, hint: error.hint, code: error.code });
            continue; // leave in queue — only remove after confirmed success
          }
          await markRecordSynced(table, local_uuid, (data && data[0]) || payload);
        } else if (operation === 'PATCH' || operation === 'PUT') {
          const id = payload.id;
          if (!id) {
            console.warn('SYNC DROPPED — update without id cannot be replayed', { table, local_uuid, payload });
            await removeQueueItem(local_uuid);
            continue;
          }
          const cleanPayload = prepareServerPayload(payload, operation);
          console.log('PAYLOAD', cleanPayload);
          const { data, error } = await supabase.from(table).update(cleanPayload).eq('id', id).select();
          console.log('SUPABASE RESPONSE', data);
          if (error) {
            console.error('SUPABASE ERROR', { table, operation, local_uuid, message: error.message, details: error.details, hint: error.hint, code: error.code });
            continue;
          }
          await markRecordSynced(table, local_uuid, (data && data[0]) || payload);
        } else if (operation === 'DELETE') {
          const id = payload.id;
          if (!id) {
            console.warn('SYNC DROPPED — delete without id cannot be replayed', { table, local_uuid });
            await removeQueueItem(local_uuid);
            continue;
          }
          console.log('PAYLOAD', { id });
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) {
            console.error('SUPABASE ERROR', { table, operation, local_uuid, message: error.message, details: error.details, hint: error.hint, code: error.code });
            continue;
          }
          console.log('SUPABASE RESPONSE', `deleted ${table} id=${id}`);
          await removeQueueItem(local_uuid);
        } else {
          console.warn('SYNC DROPPED — unknown operation', { table, operation, local_uuid });
          await removeQueueItem(local_uuid);
        }

        window.dispatchEvent(new CustomEvent('sync-status', { detail: { local_uuid, table, status: 'synced' } }));
      } catch (e) {
        console.error('SUPABASE ERROR (exception)', { table, operation, local_uuid, error: e?.message || e });
      }
    }

    const after = await getPendingQueue();
    console.log('QUEUE AFTER', after.map(q => ({ table: q.table, op: q.operation, local_uuid: q.local_uuid })));
    if (after.length > 0) {
      console.warn(`SYNC INCOMPLETE — ${after.length} item(s) still pending (see SUPABASE ERROR / SYNC DEFERRED logs above)`);
    }
  } catch (e) {
    console.error('syncPendingData error', e);
  } finally {
    syncRunning = false;
  }
}
