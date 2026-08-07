export function calculateProfitMetrics({ sellingPrice, purchasePrice, quantity }) {
  const quantityValue = Number(quantity) || 0;
  const selling = Number(sellingPrice) || 0;
  const buying = Number(purchasePrice) || 0;

  const revenue = selling * quantityValue;
  const cost = buying * quantityValue;
  const profit = revenue - cost;

  return {
    revenue,
    cost,
    profit,
  };
}
