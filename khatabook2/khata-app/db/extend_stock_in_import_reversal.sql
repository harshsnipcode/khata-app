-- Reuse the existing Excel-import reversal/recycle-bin infrastructure for Stock
-- In Excel imports.
--
-- Stock-in imports write their data to `product_transactions`, but that table
-- previously had no link back to its `import_history` record. This migration:
--   1. adds an `import_history_id` column to `product_transactions`,
--   2. makes the shared delete_import_batch / restore_import_batch RPCs branch
--      on whether the import is a "Stock In" import, reversing/restoring
--      `product_transactions` and product stock (instead of ledgers).
--
-- The existing `import_reversal_snapshots` (snapshot storage) and
-- `import_batch_recycle_bin` (server-side recycle bin) tables are reused, so
-- the existing Recycle Bin UI and permanently_delete_import_batch work for
-- Stock In imports with no separate architecture.

ALTER TABLE public.product_transactions
  ADD COLUMN IF NOT EXISTS import_history_id uuid
  REFERENCES public.import_history(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS product_transactions_import_history_id_idx
  ON public.product_transactions(import_history_id);

-- Shared delete/restore RPC. For a "Stock In" import (identified by the
-- workbook sheet), reverse/restore the product_transactions + product stock
-- created by that import. All other imports keep the original transaction
-- ledger behaviour unchanged.
CREATE OR REPLACE FUNCTION public.delete_import_batch(
  p_import_history_id uuid,
  p_actor text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  history_row public.import_history;
  transaction_snapshot jsonb;
  item_snapshot jsonb;
  transaction_count integer;
  expected_count integer;
  is_stock_in boolean;
  stock_in_snapshot jsonb;
BEGIN
  SELECT * INTO history_row
  FROM public.import_history
  WHERE id = p_import_history_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Import history not found'; END IF;
  IF history_row.status = 'deleted' THEN RAISE EXCEPTION 'This import has already been deleted.'; END IF;
  IF history_row.status NOT IN ('imported', 'restored') THEN
    RAISE EXCEPTION 'Only imported or restored batches can be deleted.';
  END IF;

  is_stock_in := (history_row.sheet_name = 'Stock In');

  -- ------------------------- Stock In Import -----------------------------
  IF is_stock_in THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) ORDER BY pt.id), '[]'::jsonb)
    INTO stock_in_snapshot
    FROM public.product_transactions pt
    WHERE pt.import_history_id = p_import_history_id;

    -- Only an import that actually created stock-in rows may be reversed.
    IF jsonb_array_length(stock_in_snapshot) = 0 THEN
      RAISE EXCEPTION 'This Stock In import has no linked stock-in records that can be rolled back.';
    END IF;

    INSERT INTO public.import_reversal_snapshots (
      import_history_id, transactions, transaction_items, captured_at
    ) VALUES (
      p_import_history_id, stock_in_snapshot, '[]'::jsonb, now()
    )
    ON CONFLICT (import_history_id) DO UPDATE SET
      transactions = EXCLUDED.transactions,
      transaction_items = EXCLUDED.transaction_items,
      captured_at = EXCLUDED.captured_at;

    -- Roll back product stock created by this exact import.
    WITH removed_stock AS (
      SELECT pt.product_id, SUM(pt.quantity) AS quantity
      FROM public.product_transactions pt
      WHERE pt.import_history_id = p_import_history_id
      GROUP BY pt.product_id
    )
    UPDATE public.products p
    SET stock_quantity = p.stock_quantity - removed_stock.quantity,
        updated_at = now()
    FROM removed_stock
    WHERE p.id = removed_stock.product_id;

    DELETE FROM public.product_transactions
    WHERE import_history_id = p_import_history_id;

    SELECT jsonb_array_length(stock_in_snapshot) INTO transaction_count;

    UPDATE public.import_history
    SET status = 'deleted', deleted_at = now(), deleted_by = p_actor,
        restored_at = NULL, restored_by = NULL
    WHERE id = p_import_history_id;

    INSERT INTO public.import_batch_recycle_bin (
      import_history_id, filename, transaction_count, deleted_at, deleted_by, restore_deadline
    ) VALUES (
      p_import_history_id, history_row.filename, transaction_count, now(), p_actor,
      now() + interval '90 days'
    )
    ON CONFLICT (import_history_id) DO UPDATE SET
      filename = EXCLUDED.filename,
      transaction_count = EXCLUDED.transaction_count,
      deleted_at = EXCLUDED.deleted_at,
      deleted_by = EXCLUDED.deleted_by,
      restore_deadline = EXCLUDED.restore_deadline;

    RETURN transaction_count;
  END IF;
  -- --------------------- End Stock In Import -----------------------------

  SELECT COUNT(*), COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
  INTO transaction_count, transaction_snapshot
  FROM public.transactions t
  WHERE t.import_history_id = p_import_history_id;

  expected_count := COALESCE((history_row.import_statistics->>'transactionsCreated')::integer, 0);
  IF transaction_count = 0 AND expected_count > 0 THEN
    PERFORM public.link_legacy_import_transactions(p_import_history_id);

    SELECT COUNT(*), COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
    INTO transaction_count, transaction_snapshot
    FROM public.transactions t
    WHERE t.import_history_id = p_import_history_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb)
  INTO item_snapshot
  FROM public.transaction_items i
  JOIN public.transactions t ON t.id = i.transaction_id
  WHERE t.import_history_id = p_import_history_id;

  INSERT INTO public.import_reversal_snapshots (
    import_history_id, transactions, transaction_items, captured_at
  ) VALUES (
    p_import_history_id, transaction_snapshot, item_snapshot, now()
  )
  ON CONFLICT (import_history_id) DO UPDATE SET
    transactions = EXCLUDED.transactions,
    transaction_items = EXCLUDED.transaction_items,
    captured_at = EXCLUDED.captured_at;

  WITH restored_stock AS (
    SELECT i.product_id, SUM(i.quantity) AS quantity
    FROM public.transaction_items i
    JOIN public.transactions t ON t.id = i.transaction_id
    WHERE t.import_history_id = p_import_history_id
    GROUP BY i.product_id
  )
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + restored_stock.quantity,
      updated_at = now()
  FROM restored_stock
  WHERE p.id = restored_stock.product_id;

  DELETE FROM public.transactions WHERE import_history_id = p_import_history_id;

  UPDATE public.import_history
  SET status = 'deleted', deleted_at = now(), deleted_by = p_actor,
      restored_at = NULL, restored_by = NULL
  WHERE id = p_import_history_id;

  INSERT INTO public.import_batch_recycle_bin (
    import_history_id, filename, transaction_count, deleted_at, deleted_by, restore_deadline
  ) VALUES (
    p_import_history_id, history_row.filename, transaction_count, now(), p_actor,
    now() + interval '90 days'
  )
  ON CONFLICT (import_history_id) DO UPDATE SET
    filename = EXCLUDED.filename,
    transaction_count = EXCLUDED.transaction_count,
    deleted_at = EXCLUDED.deleted_at,
    deleted_by = EXCLUDED.deleted_by,
    restore_deadline = EXCLUDED.restore_deadline;

  RETURN transaction_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_import_batch(
  p_import_history_id uuid,
  p_actor text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  history_row public.import_history;
  snapshot_row public.import_reversal_snapshots;
  restored_count integer;
  is_stock_in boolean;
BEGIN
  SELECT * INTO history_row
  FROM public.import_history
  WHERE id = p_import_history_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Import history not found'; END IF;
  IF history_row.status <> 'deleted' THEN RAISE EXCEPTION 'This import is not deleted.'; END IF;

  SELECT * INTO snapshot_row
  FROM public.import_reversal_snapshots
  WHERE import_history_id = p_import_history_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import reversal snapshot not found'; END IF;

  is_stock_in := (history_row.sheet_name = 'Stock In');

  -- ------------------------- Stock In Import -----------------------------
  IF is_stock_in THEN
    INSERT INTO public.product_transactions (
      id, product_id, type, quantity, price, notes, created_by, created_at, import_history_id
    )
    SELECT
      restored.id, restored.product_id, restored.type,
      restored.quantity, restored.price, restored.notes,
      restored.created_by, restored.created_at, restored.import_history_id
    FROM jsonb_populate_recordset(NULL::public.product_transactions, snapshot_row.transactions) restored;

    -- Restore product stock created by this exact import.
    WITH re_added_stock AS (
      SELECT item.product_id, SUM(item.quantity) AS quantity
      FROM jsonb_to_recordset(snapshot_row.transactions)
        AS item(product_id integer, quantity numeric)
      GROUP BY item.product_id
    )
    UPDATE public.products p
    SET stock_quantity = p.stock_quantity + re_added_stock.quantity,
        updated_at = now()
    FROM re_added_stock
    WHERE p.id = re_added_stock.product_id;

    SELECT jsonb_array_length(snapshot_row.transactions) INTO restored_count;

    UPDATE public.import_history
    SET status = 'restored', restored_at = now(), restored_by = p_actor
    WHERE id = p_import_history_id;

    DELETE FROM public.import_batch_recycle_bin
    WHERE import_history_id = p_import_history_id;

    RETURN restored_count;
  END IF;
  -- --------------------- End Stock In Import -----------------------------

  INSERT INTO public.transactions (
    id, customer_id, type, amount, description, payment_mode, date,
    created_by, created_at, import_history_id
  )
  SELECT
    restored.id, restored.customer_id, restored.type, restored.amount,
    restored.description, restored.payment_mode, restored.date,
    restored.created_by, restored.created_at, restored.import_history_id
  FROM jsonb_populate_recordset(NULL::public.transactions, snapshot_row.transactions) restored;

  INSERT INTO public.transaction_items (
    id, transaction_id, product_id, quantity, price, created_at
  )
  SELECT
    restored.id, restored.transaction_id, restored.product_id,
    restored.quantity, restored.price, restored.created_at
  FROM jsonb_populate_recordset(NULL::public.transaction_items, snapshot_row.transaction_items) restored;

  WITH removed_stock AS (
    SELECT item.product_id, SUM(item.quantity) AS quantity
    FROM jsonb_to_recordset(snapshot_row.transaction_items)
      AS item(product_id integer, quantity numeric)
    GROUP BY item.product_id
  )
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity - removed_stock.quantity,
      updated_at = now()
  FROM removed_stock
  WHERE p.id = removed_stock.product_id;

  SELECT jsonb_array_length(snapshot_row.transactions) INTO restored_count;

  UPDATE public.import_history
  SET status = 'restored', restored_at = now(), restored_by = p_actor
  WHERE id = p_import_history_id;

  DELETE FROM public.import_batch_recycle_bin
  WHERE import_history_id = p_import_history_id;

  RETURN restored_count;
END;
$$;
