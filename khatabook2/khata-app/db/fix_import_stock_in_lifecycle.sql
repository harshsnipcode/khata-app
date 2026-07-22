-- Run this in the Supabase SQL Editor.
-- Links Excel STOCK IN product transactions to their import batch, then makes
-- batch delete/restore reverse and reapply those stock movements correctly.

ALTER TABLE public.product_transactions
  ADD COLUMN IF NOT EXISTS import_history_id uuid;

ALTER TABLE public.product_transactions
  ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_transactions_import_history_id_fkey'
      AND conrelid = 'public.product_transactions'::regclass
  ) THEN
    ALTER TABLE public.product_transactions
      ADD CONSTRAINT product_transactions_import_history_id_fkey
      FOREIGN KEY (import_history_id)
      REFERENCES public.import_history(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS product_transactions_import_history_id_idx
  ON public.product_transactions(import_history_id);

ALTER TABLE public.import_reversal_snapshots
  ADD COLUMN IF NOT EXISTS product_transactions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_import_stock_in_adjustment(
  p_product_id integer,
  p_quantity numeric,
  p_created_by text,
  p_created_at timestamptz,
  p_notes text,
  p_import_history_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock numeric;
  updated_product public.products;
  created_product_transaction public.product_transactions;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive number.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.import_history WHERE id = p_import_history_id) THEN
    RAISE EXCEPTION 'Import history % does not exist', p_import_history_id;
  END IF;

  SELECT COALESCE(stock_quantity, 0)
  INTO current_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist', p_product_id;
  END IF;

  INSERT INTO public.product_transactions (
    product_id, type, quantity, price, notes, created_by, created_at, import_history_id, stock_applied
  )
  SELECT
    p_product_id, 'stock_in', p_quantity, COALESCE(purchase_price, 0),
    NULLIF(BTRIM(p_notes), ''), p_created_by, p_created_at, p_import_history_id, true
  FROM public.products
  WHERE id = p_product_id
  RETURNING * INTO created_product_transaction;

  UPDATE public.products
  SET stock_quantity = current_stock + p_quantity,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO updated_product;

  RETURN jsonb_build_object(
    'current_stock', current_stock,
    'new_stock', updated_product.stock_quantity,
    'product', to_jsonb(updated_product),
    'product_transaction', to_jsonb(created_product_transaction)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_import_stock_in_adjustment(
  integer, numeric, text, timestamptz, text, uuid
) TO anon, authenticated, service_role;

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
  product_transaction_snapshot jsonb;
  transaction_count integer;
  expected_count integer;
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

  SELECT COALESCE(jsonb_agg(to_jsonb(pt) ORDER BY pt.id), '[]'::jsonb)
  INTO product_transaction_snapshot
  FROM public.product_transactions pt
  WHERE pt.import_history_id = p_import_history_id;

  INSERT INTO public.import_reversal_snapshots (
    import_history_id, transactions, transaction_items, product_transactions, captured_at
  ) VALUES (
    p_import_history_id, transaction_snapshot, item_snapshot, product_transaction_snapshot, now()
  )
  ON CONFLICT (import_history_id) DO UPDATE SET
    transactions = EXCLUDED.transactions,
    transaction_items = EXCLUDED.transaction_items,
    product_transactions = EXCLUDED.product_transactions,
    captured_at = EXCLUDED.captured_at;

  -- Reverse customer sales from this import: sold quantity returns to stock.
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

  -- Reverse STOCK IN rows from this import: imported quantity leaves stock.
  WITH reversed_stock_adjustments AS (
    SELECT
      pt.product_id,
      SUM(
        CASE
          WHEN pt.type = 'stock_in' THEN pt.quantity
          WHEN pt.type = 'stock_out' THEN -pt.quantity
          ELSE 0
        END
      ) AS quantity
    FROM public.product_transactions pt
    WHERE pt.import_history_id = p_import_history_id
    GROUP BY pt.product_id
  )
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity - reversed_stock_adjustments.quantity,
      updated_at = now()
  FROM reversed_stock_adjustments
  WHERE p.id = reversed_stock_adjustments.product_id;

  DELETE FROM public.product_transactions
  WHERE import_history_id = p_import_history_id;

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

  INSERT INTO public.product_transactions (
    id, product_id, type, quantity, price, notes, created_by, created_at, import_history_id, stock_applied
  )
  SELECT
    restored.id, restored.product_id, restored.type, restored.quantity,
    restored.price, restored.notes, restored.created_by, restored.created_at,
    restored.import_history_id, COALESCE(restored.stock_applied, true)
  FROM jsonb_populate_recordset(
    NULL::public.product_transactions,
    COALESCE(snapshot_row.product_transactions, '[]'::jsonb)
  ) restored;

  -- Reapply imported STOCK IN rows from this batch.
  WITH reapplied_stock_adjustments AS (
    SELECT
      pt.product_id,
      SUM(
        CASE
          WHEN pt.type = 'stock_in' THEN pt.quantity
          WHEN pt.type = 'stock_out' THEN -pt.quantity
          ELSE 0
        END
      ) AS quantity
    FROM public.product_transactions pt
    WHERE pt.import_history_id = p_import_history_id
    GROUP BY pt.product_id
  )
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + reapplied_stock_adjustments.quantity,
      updated_at = now()
  FROM reapplied_stock_adjustments
  WHERE p.id = reapplied_stock_adjustments.product_id;

  SELECT jsonb_array_length(snapshot_row.transactions) INTO restored_count;

  UPDATE public.import_history
  SET status = 'restored', restored_at = now(), restored_by = p_actor
  WHERE id = p_import_history_id;

  DELETE FROM public.import_batch_recycle_bin
  WHERE import_history_id = p_import_history_id;

  RETURN restored_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
