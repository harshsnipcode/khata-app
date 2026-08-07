import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfitMetrics } from '../src/lib/profitReport.js';

test('profit calculation uses selling-price revenue and purchase-price cost', () => {
  const result = calculateProfitMetrics({
    sellingPrice: 54,
    purchasePrice: 52,
    quantity: 10,
  });

  assert.equal(result.revenue, 540);
  assert.equal(result.cost, 520);
  assert.equal(result.profit, 20);
});
