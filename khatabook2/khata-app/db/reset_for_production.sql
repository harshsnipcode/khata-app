-- ============================================================
--  Khatabook – Production Go-Live Reset Script
-- ============================================================
--  Clears all transactional / history data.
--  Preserves all master data (customers, products, employees,
--  settings, custom prices, product groups).
--
--  Generated from the actual Supabase schema (15 tables).
--  FK-safe deletion order: children → parents.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
--  1. DELETE  Customer transaction line-items
--         FK: transaction_items.transaction_id → transactions(id)
-- ────────────────────────────────────────────────────────────
DELETE FROM public.transaction_items;

-- ────────────────────────────────────────────────────────────
--  2. DELETE  Customer transactions
--         FK: transactions.customer_id    → customers(id)
--         FK: transactions.import_history_id → import_history(id)
-- ────────────────────────────────────────────────────────────
DELETE FROM public.transactions;

-- ────────────────────────────────────────────────────────────
--  3. DELETE  Stock-in / stock-out history
--         FK: product_transactions.product_id → products(id)
-- ────────────────────────────────────────────────────────────
DELETE FROM public.product_transactions;

-- ────────────────────────────────────────────────────────────
--  4. DELETE  Import recycle-bin entries
--         FK: import_batch_recycle_bin.import_history_id
--             → import_history(id)  ON DELETE CASCADE
-- ────────────────────────────────────────────────────────────
DELETE FROM public.import_batch_recycle_bin;

-- ────────────────────────────────────────────────────────────
--  5. DELETE  Import reversal snapshots
--         FK: import_reversal_snapshots.import_history_id
--             → import_history(id)  ON DELETE CASCADE
-- ────────────────────────────────────────────────────────────
DELETE FROM public.import_reversal_snapshots;

-- ────────────────────────────────────────────────────────────
--  6. DELETE  Import history  (root of the import chain)
-- ────────────────────────────────────────────────────────────
DELETE FROM public.import_history;

-- ────────────────────────────────────────────────────────────
--  7. RESET  Product stock to zero
-- ────────────────────────────────────────────────────────────
UPDATE public.products SET stock_quantity = 0;

COMMIT;
