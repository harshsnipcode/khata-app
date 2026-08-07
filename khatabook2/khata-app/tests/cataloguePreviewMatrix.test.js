import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDistributionMatrixGrid } from '../src/lib/cataloguePreviewMatrix.js';

const selectedDate = '2026-08-05';

test('buildDistributionMatrixGrid aggregates matching transaction_items by customer/product/date', () => {
  const customers = [{ id: 1, name: 'SHRINATH KIRANA', local_uuid: null }];
  const products = [{ id: 7, name: 'B', unit: 'Ltr', local_uuid: null }];
  const transactions = [{
    id: 101,
    customer_id: 1,
    created_at: '2026-08-05T10:30:00+05:30',
    date: '2026-08-05',
    type: 'gave',
  }];
  const transactionItems = [{
    id: 301,
    transaction_id: 101,
    product_id: 7,
    quantity: 12,
    price: 10,
  }];

  const result = buildDistributionMatrixGrid({
    customers,
    products,
    transactions,
    transactionItems,
  }, selectedDate);

  assert.equal(result.grid['1']?.['7'], 12);
  assert.equal(result.customers.length, 1);
  assert.equal(result.products.length, 1);
});
