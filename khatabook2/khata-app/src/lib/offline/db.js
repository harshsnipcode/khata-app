import Dexie from 'dexie';

const db = new Dexie('myBusinessOfflineDB');

db.version(1).stores({
  customers: '++id,local_uuid,created_at',
  transactions: '++id,local_uuid,created_at',
  products: '++id,local_uuid,created_at',
  product_transactions: '++id,local_uuid,created_at',
  transaction_items: '++id,local_uuid,created_at',
  customer_product_prices: '++id,local_uuid,created_at',
  employees: '++id,local_uuid,created_at',
  employee_attendance: '++id,local_uuid,created_at',
  sync_queue: 'local_uuid,table,created_offline,synced'
});

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

db.version(2).stores({
  customers: null,
  transactions: null,
  products: null,
  product_transactions: null,
  transaction_items: null,
  customer_product_prices: null,
  employees: null,
  employee_attendance: null,
  sync_queue: 'local_uuid,table,created_offline,synced',

  customers_temp: 'local_uuid, id, customer_id, created_at',
  transactions_temp: 'local_uuid, id, customer_id, created_at',
  products_temp: 'local_uuid, id, name, created_at',
  product_transactions_temp: 'local_uuid, id, product_id, created_at',
  transaction_items_temp: 'local_uuid, id, transaction_id, product_id, created_at',
  customer_product_prices_temp: 'local_uuid, id, customer_id, product_id, created_at',
  employees_temp: 'local_uuid, id, auth_id, created_at',
  employee_attendance_temp: 'local_uuid, id, employee_id, date, created_at',
}).upgrade(async tx => {
  const tables = [
    'customers',
    'transactions',
    'products',
    'product_transactions',
    'transaction_items',
    'customer_product_prices',
    'employees',
    'employee_attendance'
  ];
  for (const table of tables) {
    try {
      const oldRows = await tx.table(table).toArray();
      const newRows = oldRows.map(row => {
        const local_uuid = row.local_uuid || generateUUID();
        const id = (row.id !== undefined && row.id !== null) ? row.id : null;
        return {
          ...row,
          local_uuid,
          id
        };
      });
      if (newRows.length > 0) {
        await tx.table(`${table}_temp`).bulkAdd(newRows);
      }
    } catch (err) {
      console.error(`Error migrating table ${table} in v2 upgrade:`, err);
    }
  }
});

db.version(3).stores({
  customers_temp: null,
  transactions_temp: null,
  products_temp: null,
  product_transactions_temp: null,
  transaction_items_temp: null,
  customer_product_prices_temp: null,
  employees_temp: null,
  employee_attendance_temp: null,

  customers: 'local_uuid, id, customer_id, created_at',
  transactions: 'local_uuid, id, customer_id, created_at',
  products: 'local_uuid, id, name, created_at',
  product_transactions: 'local_uuid, id, product_id, created_at',
  transaction_items: 'local_uuid, id, transaction_id, product_id, created_at',
  customer_product_prices: 'local_uuid, id, customer_id, product_id, created_at',
  employees: 'local_uuid, id, auth_id, created_at',
  employee_attendance: 'local_uuid, id, employee_id, date, created_at',
  sync_queue: 'local_uuid,table,created_offline,synced'
}).upgrade(async tx => {
  const tables = [
    'customers',
    'transactions',
    'products',
    'product_transactions',
    'transaction_items',
    'customer_product_prices',
    'employees',
    'employee_attendance'
  ];
  for (const table of tables) {
    try {
      const tempRows = await tx.table(`${table}_temp`).toArray();
      if (tempRows.length > 0) {
        await tx.table(table).bulkAdd(tempRows);
      }
    } catch (err) {
      console.error(`Error migrating table ${table} in v3 upgrade:`, err);
    }
  }
});

export async function initDB() {
  await db.open();
}

export default db;

export async function saveFetchedData(table, rows) {
  if (!Array.isArray(rows)) return;
  const tableObj = db.table(table);
  try {
    const ids = rows.map(r => r && r.id).filter(id => id !== null && id !== undefined && id !== '');
    const existingRecords = ids.length > 0 ? await tableObj.where('id').anyOf(ids).toArray() : [];
    const idToLocalUuidMap = new Map();
    for (const rec of existingRecords) {
      if (rec.id !== null && rec.id !== undefined) {
        idToLocalUuidMap.set(rec.id, rec.local_uuid);
      }
    }

    const toPut = rows.map(r => {
      if (!r || typeof r !== 'object') return null;
      const { id, ...rest } = r;
      const validId = (id !== null && id !== undefined && id !== '') ? id : null;

      let local_uuid = r.local_uuid || (validId !== null ? idToLocalUuidMap.get(validId) : null);
      if (!local_uuid) {
        local_uuid = generateUUID();
      }

      return {
        ...rest,
        id: validId,
        local_uuid,
        synced: true
      };
    }).filter(Boolean);

    if (toPut.length > 0) {
      await tableObj.bulkPut(toPut);
    }
  } catch (e) {
    console.error('saveFetchedData bulkPut error', table, e);
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      try {
        const { id, ...rest } = r;
        const validId = (id !== null && id !== undefined && id !== '') ? id : null;

        let local_uuid = r.local_uuid;
        if (!local_uuid && validId !== null) {
          const existing = await tableObj.where('id').equals(validId).first();
          if (existing) {
            local_uuid = existing.local_uuid;
          }
        }
        if (!local_uuid) {
          local_uuid = generateUUID();
        }

        await tableObj.put({
          ...rest,
          id: validId,
          local_uuid,
          synced: true
        });
      } catch (e2) {
        console.error('saveFetchedData individual put error', table, e2, 'Row:', r);
      }
    }
  }
}

export async function getAll(table) {
  try {
    const tableObj = db.table(table);
    return await tableObj.toArray();
  } catch (e) {
    console.error('getAll error', table, e);
    return [];
  }
}

export async function addOfflineRecord(table, record, operation = 'INSERT') {
  const local_uuid = record.local_uuid || generateUUID();
  const created_offline = true;
  const synced = false;
  try {
    const tableObj = db.table(table);
    const { id, ...rest } = record;

    if (!record.local_uuid) record.local_uuid = local_uuid;
    if (record.id === undefined) record.id = null;

    const row = {
      ...rest,
      local_uuid,
      created_offline,
      synced,
      id: (id !== undefined && id !== null) ? id : null
    };

    await tableObj.put(row);
    await db.table('sync_queue').put({ local_uuid, table, operation, payload: record, created_offline, synced });
    return { local_uuid };
  } catch (e) {
    console.error('addOfflineRecord error', e);
    throw e;
  }
}

export async function getPendingQueue() {
  return await db.table('sync_queue').where('synced').equals(false).toArray();
}

export async function removeQueueItem(local_uuid) {
  await db.table('sync_queue').delete(local_uuid);
}

export async function markRecordSynced(table, local_uuid, serverRecord) {
  try {
    const tableObj = db.table(table);
    const existing = await tableObj.where('local_uuid').equals(local_uuid).first();
    if (!existing) return;
    const merged = {
      ...existing,
      ...serverRecord,
      synced: true,
      created_offline: false
    };
    if (serverRecord && serverRecord.id) merged.id = serverRecord.id;
    await tableObj.put(merged);
    await db.table('sync_queue').where('local_uuid').equals(local_uuid).delete();
  } catch (e) {
    console.error('markRecordSynced error', e);
  }
}