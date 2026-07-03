import assert from "node:assert/strict";
import test from "node:test";
import { collectExcelRowItems } from "../src/lib/excelImportGrouping.js";

const products = [
  { id: 1, name: "Aamras", sale_price: 100 },
  { id: 2, name: "Falooda", sale_price: 80 },
  { id: 3, name: "Buttermilk", sale_price: 20 },
];
const productMap = new Map(products.map((product) => [product.name.toLowerCase(), product]));

test("one Excel row produces one multi-item transaction payload", () => {
  const grouped = collectExcelRowItems({
    row: { rowNumber: 2, customerName: "Harsh Sharma", values: [2, 3, 10] },
    customer: { id: 7, name: "Harsh Sharma" },
    productHeaders: ["Aamras", "Falooda", "Buttermilk"],
    productMap,
    priceMap: new Map(),
  });

  assert.deepEqual(grouped.items.map(({ product, quantity, price }) => ({
    product: product.name,
    quantity,
    price,
  })), [
    { product: "Aamras", quantity: 2, price: 100 },
    { product: "Falooda", quantity: 3, price: 80 },
    { product: "Buttermilk", quantity: 10, price: 20 },
  ]);
  assert.equal(grouped.items.reduce((total, item) => total + item.quantity * item.price, 0), 640);
  assert.equal(grouped.skipped, 0);
});

test("zero cells stay inert and valid cells retain custom prices", () => {
  const grouped = collectExcelRowItems({
    row: { rowNumber: 3, customerName: "Rahul Sharma", values: [0, "", 5] },
    customer: { id: 9, name: "Rahul Sharma" },
    productHeaders: ["Aamras", "Falooda", "Buttermilk"],
    productMap,
    priceMap: new Map([["9:3", 17]]),
  });

  assert.equal(grouped.items.length, 1);
  assert.equal(grouped.items[0].product.name, "Buttermilk");
  assert.equal(grouped.items[0].quantity, 5);
  assert.equal(grouped.items[0].price, 17);
  assert.equal(grouped.skipped, 0);
});

test("unknown and invalid product cells are skipped without blocking valid row items", () => {
  const grouped = collectExcelRowItems({
    row: { rowNumber: 4, customerName: "Harsh Sharma", values: [2, "many", 1] },
    customer: { id: 7, name: "Harsh Sharma" },
    productHeaders: ["Unknown", "Falooda", "Buttermilk"],
    productMap,
    priceMap: new Map(),
  });

  assert.equal(grouped.items.length, 1);
  assert.equal(grouped.items[0].product.name, "Buttermilk");
  assert.equal(grouped.skipped, 2);
  assert.match(grouped.errors[0], /Quantity must be a number/);
});
