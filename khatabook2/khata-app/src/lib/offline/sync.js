import { getPendingQueue, markRecordSynced, removeQueueItem } from './db';
import { supabase } from '../supabase';

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

  if (operation === 'POST' || operation === 'INSERT') {
    if (copy.id === null || copy.id === undefined || copy.id === '') {
      delete copy.id;
    }
  }
  return copy;
}

export async function syncPendingData() {
  if (!navigator.onLine) return;
  try {
    const queue = await getPendingQueue();
    for (const item of queue) {
      try {
        const { local_uuid, table, operation, payload } = item;

        if (operation === 'POST' || operation === 'INSERT' || operation === 'UPSERT') {
          const cleanPayload = prepareServerPayload(payload, operation);
          const { data, error } = await supabase.from(table).insert(Array.isArray(cleanPayload) ? cleanPayload : [cleanPayload]);
          if (error) {
            console.warn('Sync insert failed for', table, error.message);
            continue;
          }
          if (data && data.length) {
            await markRecordSynced(table, local_uuid, data[0]);
          } else {
            await markRecordSynced(table, local_uuid, payload);
          }
        } else if (operation === 'PATCH' || operation === 'PUT') {
          const id = payload.id;
          if (!id) {
            await removeQueueItem(local_uuid);
            continue;
          }
          const cleanPayload = prepareServerPayload(payload, operation);
          const { data, error } = await supabase.from(table).update(cleanPayload).eq('id', id);
          if (!error) {
            await markRecordSynced(table, local_uuid, data ? data[0] : payload);
          }
        } else if (operation === 'DELETE') {
          const id = payload.id;
          if (id) {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (!error) await removeQueueItem(local_uuid);
          } else {
            await removeQueueItem(local_uuid);
          }
        } else {
          await removeQueueItem(local_uuid);
        }

        window.dispatchEvent(new CustomEvent('sync-status', { detail: { local_uuid, table, status: 'synced' } }));
      } catch (e) {
        console.error('Error syncing item', e);
      }
    }
  } catch (e) {
    console.error('syncPendingData error', e);
  }
}
