import { supabase } from '../supabase';
import { addOfflineRecord, getAll } from './db';

function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function createQueryBuilder(table, method, payload) {
  const ops = { table, method, payload, filters: [], selectColumns: null };

  return {
    select(columns) {
      ops.selectColumns = columns || '*';
      return this;
    },
    single() {
      ops.single = true;
      return this;
    },
    eq(column, value) {
      ops.filters.push({ column, operator: 'eq', value });
      return this;
    },
    neq(column, value) {
      ops.filters.push({ column, operator: 'neq', value });
      return this;
    },
    gt(column, value) {
      ops.filters.push({ column, operator: 'gt', value });
      return this;
    },
    gte(column, value) {
      ops.filters.push({ column, operator: 'gte', value });
      return this;
    },
    lt(column, value) {
      ops.filters.push({ column, operator: 'lt', value });
      return this;
    },
    lte(column, value) {
      ops.filters.push({ column, operator: 'lte', value });
      return this;
    },
    like(column, pattern) {
      ops.filters.push({ column, operator: 'like', value: pattern });
      return this;
    },
    ilike(column, pattern) {
      ops.filters.push({ column, operator: 'ilike', value: pattern });
      return this;
    },
    in(column, values) {
      ops.filters.push({ column, operator: 'in', value: values });
      return this;
    },
    is(column, value) {
      ops.filters.push({ column, operator: 'is', value });
      return this;
    },

    async then(onFulfilled, onRejected) {
      const result = await this.execute();
      return onFulfilled ? onFulfilled(result) : result;
    },

    order(column, { ascending = true } = {}) {
      ops.order = { column, ascending };
      return this;
    },

    limit(count) {
      ops.limit = count;
      return this;
    },

    async execute() {
      if (!isOnline()) {
        return await this.executeOffline();
      }

      let query = supabase.from(table)[method](payload);
      if (ops.selectColumns) {
        query = query.select(ops.selectColumns);
      }
      if (ops.single) {
        query = query.single();
      }
      for (const f of ops.filters) {
        query = query[f.operator](f.column, f.value);
      }
      if (ops.order) {
        query = query.order(ops.order.column, { ascending: ops.order.ascending });
      }
      if (ops.limit !== undefined) {
        query = query.limit(ops.limit);
      }
      const { data, error } = await query;
      return { data, error };
    },

    async executeOffline() {
      if (method === 'insert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        const results = [];
        for (const row of rows) {
          const { local_uuid } = await addOfflineRecord(table, row, 'POST');
          results.push({ ...row, local_uuid });
        }
        window.dispatchEvent(new CustomEvent('offline-saved', {
          detail: { message: 'Saved offline. Will sync automatically.', table }
        }));
        return { data: results, error: null };
      }

      if (method === 'update') {
        if (!payload.id && ops.filters.length === 0) {
          return { data: null, error: { message: 'Update requires id or filters' } };
        }
        const record = { ...payload };
        if (!record.id) {
          const eqFilter = ops.filters.find(f => f.operator === 'eq');
          if (eqFilter) record.id = eqFilter.value;
        }
        await addOfflineRecord(table, record, 'PATCH');
        window.dispatchEvent(new CustomEvent('offline-saved', {
          detail: { message: 'Saved offline. Will sync automatically.', table }
        }));
        return { data: [record], error: null };
      }

      if (method === 'delete') {
        let id = null;
        const eqFilter = ops.filters.find(f => f.operator === 'eq');
        if (eqFilter) id = eqFilter.value;
        if (!id && payload?.id) id = payload.id;
        if (!id) {
          return { data: null, error: { message: 'Delete requires id' } };
        }
        await addOfflineRecord(table, { id }, 'DELETE');
        window.dispatchEvent(new CustomEvent('offline-saved', {
          detail: { message: 'Saved offline. Will sync automatically.', table }
        }));
        return { data: [{ id }], error: null };
      }

      if (method === 'upsert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        const results = [];
        for (const row of rows) {
          const { local_uuid } = await addOfflineRecord(table, row, 'UPSERT');
          results.push({ ...row, local_uuid });
        }
        window.dispatchEvent(new CustomEvent('offline-saved', {
          detail: { message: 'Saved offline. Will sync automatically.', table }
        }));
        return { data: results, error: null };
      }

      return { data: null, error: { message: `Unsupported method: ${method}` } };
    }
  };
}

export const offlineSupabase = {
  from(table) {
    return {
      select: (...args) => supabase.from(table).select(...args),
      insert: (payload) => createQueryBuilder(table, 'insert', payload),
      update: (payload) => createQueryBuilder(table, 'update', payload),
      delete: (payload = {}) => createQueryBuilder(table, 'delete', payload),
      upsert: (payload) => createQueryBuilder(table, 'upsert', payload),
    };
  },
  auth: supabase.auth,
  storage: supabase.storage,
  rpc: supabase.rpc.bind(supabase),
  channel: supabase.channel.bind(supabase),
  removeChannel: supabase.removeChannel.bind(supabase),
};

export function useOfflineFirst(table) {
  return {
    async getAll() {
      if (isOnline()) {
        const { data, error } = await supabase.from(table).select('*');
        if (!error && data) {
          await import('./db').then(m => m.saveFetchedData(table, data));
        }
        return { data, error };
      }
      const data = await getAll(table);
      return { data, error: null };
    },
    async getById(id) {
      if (isOnline()) {
        const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
        if (!error && data) {
          await import('./db').then(m => m.saveFetchedData(table, [data]));
        }
        return { data, error };
      }
      const all = await getAll(table);
      const found = all.find(r => r.id === id || r.local_uuid === id);
      return { data: found || null, error: found ? null : { message: 'Not found' } };
    }
  };
}

export default offlineSupabase;