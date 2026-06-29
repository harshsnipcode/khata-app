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

db.version(4).stores({
  recycle_bin: 'local_uuid, entity_type, entity_id, entity_name, deleted_at, deleted_by, original_data, restore_deadline',
}).upgrade(async tx => {
  // No data migration needed for new table
});

db.version(5).stores({
  customers_temp: null, transactions_temp: null,
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
  sync_queue: 'local_uuid,table,created_offline,synced',
  recycle_bin: 'local_uuid, entity_type, entity_id, entity_name, deleted_at, deleted_by, original_data, restore_deadline'
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

db.version(6).stores({
  customers: 'local_uuid, id, customer_id, created_at, route_position',
  transactions: 'local_uuid, id, customer_id, created_at',
  products: 'local_uuid, id, name, created_at',
  product_transactions: 'local_uuid, id, product_id, created_at',
  transaction_items: 'local_uuid, id, transaction_id, product_id, created_at',
  customer_product_prices: 'local_uuid, id, customer_id, product_id, created_at',
  employees: 'local_uuid, id, auth_id, created_at',
  employee_attendance: 'local_uuid, id, employee_id, date, created_at',
  sync_queue: 'local_uuid,table,created_offline,synced',
  recycle_bin: 'local_uuid, entity_type, entity_id, entity_name, deleted_at, deleted_by, original_data, restore_deadline',
  business_settings: 'local_uuid, id',
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

// Recycle Bin functions
export async function moveToRecycleBin(entityType, entityId, entityName, originalData, deletedBy) {
  const local_uuid = generateUUID();
  const deleted_at = new Date().toISOString();
  const restore_deadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days

  console.log(`[RecycleBin:moveToRecycleBin] called with:`, {
    entityType,
    entityId,
    entityName,
    originalDataHasCustomerId: 'customer_id' in (originalData || {}),
    originalDataCustomerId: originalData?.customer_id,
    originalDataType: typeof originalData?.customer_id,
    originalDataKeys: Object.keys(originalData || {}),
  });

  // ALWAYS use the passed originalData as source of truth (has all fields)
  // Only extract local_uuid from Dexie to preserve primary key, NEVER replace data
  let dataToStore = { ...originalData };
  try {
    const localRecord = await db.table(entityType).where('id').equals(Number(entityId)).first();
    if (localRecord && localRecord.local_uuid) {
      dataToStore.local_uuid = localRecord.local_uuid;
      console.log(`[RecycleBin:moveToRecycleBin] Preserved local_uuid from Dexie:`, localRecord.local_uuid);
    } else {
      console.log(`[RecycleBin:moveToRecycleBin] No local Dexie record found, using originalData's local_uuid`);
    }
  } catch (e) {
    console.error(`[RecycleBin:moveToRecycleBin] Error reading local record:`, e);
  }

  // Ensure local_uuid exists
  if (!dataToStore.local_uuid) {
    dataToStore.local_uuid = local_uuid;
  }

  console.log(`[RecycleBin:moveToRecycleBin] dataToStore before JSON.stringify:`, {
    hasCustomerId: 'customer_id' in dataToStore,
    customerId: dataToStore.customer_id,
    customerIdType: typeof dataToStore.customer_id,
    keys: Object.keys(dataToStore),
  });

  const record = {
    local_uuid,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    deleted_at,
    deleted_by: deletedBy || localStorage.getItem('khata_user') || 'unknown',
    original_data: JSON.stringify(dataToStore),
    restore_deadline,
  };

  console.log(`[RecycleBin:moveToRecycleBin] Stored in recycle bin, original_data length:`, record.original_data.length);

  await db.table('recycle_bin').put(record);
  return local_uuid;
}

export async function getRecycleBin() {
  try {
    const items = await db.table('recycle_bin').toArray();
    return items.map(item => ({
      ...item,
      original_data: JSON.parse(item.original_data),
    }));
  } catch (e) {
    console.error('getRecycleBin error', e);
    return [];
  }
}

export async function restoreFromRecycleBin(local_uuid) {
  try {
    const item = await db.table('recycle_bin').get(local_uuid);
    if (!item) return { success: false, error: 'Item not found' };

    const originalData = JSON.parse(item.original_data);
    const entityType = item.entity_type;

    // Handle new wrapper format: { transaction: {...}, transaction_items: [...] }
    if (entityType === "transactions" && originalData.transaction) {
      const transactionData = originalData.transaction;
      const itemsData = originalData.transaction_items || [];

      console.log(`[RecycleBin] Restoring transaction with ${itemsData.length} item(s):`, {
        entityType,
        entityId: item.entity_id,
        originalDataId: transactionData.id,
        originalDataCustomerId: transactionData.customer_id,
        itemCount: itemsData.length,
      });

      // Ensure local_uuid exists for Dexie primary key
      if (!transactionData.local_uuid) {
        transactionData.local_uuid = generateUUID();
      }

      // Clear any deleted/recycle-bin flags
      delete transactionData.deleted;
      delete transactionData.deleted_at;
      delete transactionData.in_recycle_bin;

      // Restore transaction to transactions table
      await db.table("transactions").put(transactionData);

      // Restore each item to transaction_items table
      for (const itemData of itemsData) {
        if (!itemData.local_uuid) {
          itemData.local_uuid = generateUUID();
        }
        delete itemData.deleted;
        delete itemData.deleted_at;
        delete itemData.in_recycle_bin;
        // Strip any joined data (e.g. from Supabase .select("..., products(name)"))
        delete itemData.products;
        await db.table("transaction_items").put(itemData);
      }

      // Remove from recycle bin
      await db.table('recycle_bin').delete(local_uuid);

      console.log(`[RecycleBin] Restore to Dexie complete (${itemsData.length} items):`, {
        entityType,
        restoredId: transactionData.id,
        local_uuid: transactionData.local_uuid,
      });

      return { success: true, data: transactionData, entityType, transaction_items: itemsData };
    }

    // Original format: direct entity object
    console.log(`[RecycleBin] Restoring from recycle bin:`, {
      entityType,
      entityId: item.entity_id,
      entityName: item.entity_name,
      originalDataId: originalData.id,
      originalDataCustomerId: originalData.customer_id,
    });

    // Ensure local_uuid exists for Dexie primary key
    if (!originalData.local_uuid) {
      originalData.local_uuid = generateUUID();
    }

    // Clear any deleted/recycle-bin flags before restore
    delete originalData.deleted;
    delete originalData.deleted_at;
    delete originalData.in_recycle_bin;

    // Extract and restore embedded transactions before saving customer to Dexie
    const embeddedTxnList = originalData._transactions;
    delete originalData._transactions;

    // Restore to original table
    await db.table(entityType).put(originalData);

    // Restore any embedded transactions (customer cascade restore)
    const restoredTransactions = [];
    if (embeddedTxnList && Array.isArray(embeddedTxnList)) {
      for (const txnWrapper of embeddedTxnList) {
        const txnData = txnWrapper.transaction;
        const itemsData = txnWrapper.transaction_items || [];

        if (txnData) {
          if (!txnData.local_uuid) txnData.local_uuid = generateUUID();
          delete txnData.deleted;
          delete txnData.deleted_at;
          delete txnData.in_recycle_bin;
          await db.table("transactions").put(txnData);
        }

        for (const itemData of itemsData) {
          if (!itemData.local_uuid) itemData.local_uuid = generateUUID();
          delete itemData.deleted;
          delete itemData.deleted_at;
          delete itemData.in_recycle_bin;
          delete itemData.products;
          await db.table("transaction_items").put(itemData);
        }

        restoredTransactions.push(txnWrapper);
      }
    }

    // Remove from recycle bin
    await db.table('recycle_bin').delete(local_uuid);

    console.log(`[RecycleBin] Restore to Dexie complete:`, {
      entityType,
      restoredId: originalData.id,
      local_uuid: originalData.local_uuid,
      embeddedTransactions: restoredTransactions.length,
    });

    return { success: true, data: originalData, entityType, _transactions: restoredTransactions };
  } catch (e) {
    console.error('[RecycleBin] restoreFromRecycleBin error:', e);
    return { success: false, error: e.message };
  }
}

export async function permanentlyDeleteFromRecycleBin(local_uuid) {
  try {
    await db.table('recycle_bin').delete(local_uuid);
    return { success: true };
  } catch (e) {
    console.error('permanentlyDeleteFromRecycleBin error', e);
    return { success: false, error: e.message };
  }
}

export async function cleanupRecycleBin() {
  try {
    const now = new Date().toISOString();
    const expired = await db.table('recycle_bin').where('restore_deadline').below(now).toArray();
    if (expired.length > 0) {
      await db.table('recycle_bin').bulkDelete(expired.map(e => e.local_uuid));
    }
    return { success: true, cleaned: expired.length };
  } catch (e) {
    console.error('cleanupRecycleBin error', e);
    return { success: false, error: e.message };
  }
}