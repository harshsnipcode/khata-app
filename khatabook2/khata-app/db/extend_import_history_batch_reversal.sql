-- Run after create_import_history_table.sql.
-- Adds atomic delete/restore support for Excel import batches.

ALTER TABLE public.import_history DROP CONSTRAINT IF EXISTS import_history_status_check;

UPDATE public.import_history
SET status = 'imported'
WHERE status IN ('completed', 'completed_with_errors');

ALTER TABLE public.import_history
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by text;

ALTER TABLE public.import_history
  ADD CONSTRAINT import_history_status_check
  CHECK (status IN ('processing', 'imported', 'deleted', 'restored', 'failed'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS import_history_id uuid
  REFERENCES public.import_history(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS transactions_import_history_id_idx
  ON public.transactions(import_history_id);

CREATE TABLE IF NOT EXISTS public.import_reversal_snapshots (
  import_history_id uuid PRIMARY KEY REFERENCES public.import_history(id) ON DELETE CASCADE,
  transactions jsonb NOT NULL,
  transaction_items jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_batch_recycle_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_history_id uuid NOT NULL UNIQUE REFERENCES public.import_history(id) ON DELETE CASCADE,
  filename text NOT NULL,
  transaction_count integer NOT NULL DEFAULT 0,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text NOT NULL,
  restore_deadline timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

-- Overload used only by Excel Import. The original five-argument function
-- remains unchanged for manual transactions.
CREATE OR REPLACE FUNCTION public.create_gave_transaction(
  p_customer_id integer,
  p_items jsonb,
  p_amount numeric,
  p_created_by text,
  p_created_at timestamptz,
  p_import_history_id uuid
)
RETURNS public.transactions
LANGUAGE plpgsql
AS $$
DECLARE
  created_transaction public.transactions;
  item_record record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.import_history WHERE id = p_import_history_id) THEN
    RAISE EXCEPTION 'Import history % does not exist', p_import_history_id;
  END IF;

  INSERT INTO public.transactions (
    customer_id, type, amount, created_by, created_at, import_history_id
  )
  VALUES (
    p_customer_id, 'gave', p_amount, p_created_by, p_created_at, p_import_history_id
  )
  RETURNING * INTO created_transaction;

  FOR item_record IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS item(product_id integer, quantity numeric, price numeric)
  LOOP
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price)
    VALUES (created_transaction.id, item_record.product_id, item_record.quantity, item_record.price);

    UPDATE public.products
    SET stock_quantity = stock_quantity - item_record.quantity,
        updated_at = now()
    WHERE id = item_record.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % does not exist', item_record.product_id;
    END IF;
  END LOOP;

  RETURN created_transaction;
END;
$$;

-- Safely repairs imports created before import_history_id was added. It links
-- only when the stored workbook preview produces an exact, unambiguous set of
-- one-item transactions by the same uploader in that import's time window.
CREATE OR REPLACE FUNCTION public.link_legacy_import_transactions(p_import_history_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  history_row public.import_history;
  expected_count integer;
  candidate_count integer;
  window_transaction_count integer;
  candidate_ids integer[];
  first_candidate_at timestamptz;
  last_candidate_at timestamptz;
  window_end timestamptz;
BEGIN
  SELECT * INTO history_row
  FROM public.import_history
  WHERE id = p_import_history_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Import history not found'; END IF;

  expected_count := COALESCE((history_row.import_statistics->>'transactionsCreated')::integer, 0);
  IF expected_count = 0 THEN RETURN 0; END IF;

  SELECT LEAST(
    history_row.uploaded_at + interval '6 hours',
    COALESCE(
      (SELECT MIN(next_history.uploaded_at)
       FROM public.import_history next_history
       WHERE next_history.uploader = history_row.uploader
         AND next_history.uploaded_at > history_row.uploaded_at),
      history_row.uploaded_at + interval '6 hours'
    )
  ) INTO window_end;

  WITH preview_rows AS (
    SELECT row_value, row_number
    FROM jsonb_array_elements(history_row.parsed_preview) WITH ORDINALITY
      AS rows(row_value, row_number)
    WHERE row_number > 1
  ), preview_cells AS (
    SELECT
      rows.row_value->>0 AS customer_name,
      history_row.parsed_preview->0->>((cells.column_number - 1)::integer) AS product_name,
      CASE
        WHEN replace(cells.cell_value #>> '{}', ',', '') ~ '^\s*\+?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)\s*$'
        THEN replace(cells.cell_value #>> '{}', ',', '')::numeric
        ELSE NULL
      END AS quantity
    FROM preview_rows rows
    CROSS JOIN LATERAL jsonb_array_elements(rows.row_value) WITH ORDINALITY
      AS cells(cell_value, column_number)
    WHERE cells.column_number > 1
  ), expected AS (
    SELECT
      customer.id AS customer_id,
      product.id AS product_id,
      cells.quantity
    FROM preview_cells cells
    JOIN public.customers customer ON
      lower(regexp_replace(trim(customer.name), '\s+', ' ', 'g')) =
      lower(regexp_replace(trim(cells.customer_name), '\s+', ' ', 'g'))
    JOIN public.products product ON
      lower(regexp_replace(trim(product.name), '\s+', ' ', 'g')) =
      lower(regexp_replace(trim(cells.product_name), '\s+', ' ', 'g'))
    WHERE cells.quantity > 0
  ), candidates AS (
    SELECT DISTINCT transaction.id, transaction.created_at
    FROM expected
    JOIN public.transactions transaction
      ON transaction.customer_id = expected.customer_id
     AND transaction.type = 'gave'
     AND transaction.import_history_id IS NULL
     AND transaction.created_by = history_row.uploader
     AND transaction.created_at >= history_row.uploaded_at - interval '15 minutes'
     AND transaction.created_at < window_end
    JOIN public.transaction_items item
      ON item.transaction_id = transaction.id
     AND item.product_id = expected.product_id
     AND item.quantity = expected.quantity
    WHERE NOT EXISTS (
      SELECT 1 FROM public.transaction_items other_item
      WHERE other_item.transaction_id = transaction.id
        AND other_item.id <> item.id
    )
  )
  SELECT
    COUNT(*), array_agg(id ORDER BY id), MIN(created_at), MAX(created_at)
  INTO candidate_count, candidate_ids, first_candidate_at, last_candidate_at
  FROM candidates;

  IF candidate_count <> expected_count THEN
    RAISE EXCEPTION
      'Legacy import linkage is ambiguous: expected % transactions but found %. No records were changed.',
      expected_count, candidate_count;
  END IF;

  -- Nothing unrelated may be interleaved in the matched import run.
  SELECT COUNT(*) INTO window_transaction_count
  FROM public.transactions transaction
  WHERE transaction.import_history_id IS NULL
    AND transaction.created_by = history_row.uploader
    AND transaction.created_at BETWEEN first_candidate_at AND last_candidate_at;

  IF window_transaction_count <> candidate_count THEN
    RAISE EXCEPTION
      'Legacy import linkage is ambiguous because unrelated transactions overlap its processing window. No records were changed.';
  END IF;

  UPDATE public.transactions
  SET import_history_id = p_import_history_id
  WHERE id = ANY(candidate_ids);

  RETURN candidate_count;
END;
$$;

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

  SELECT jsonb_array_length(snapshot_row.transactions) INTO restored_count;

  UPDATE public.import_history
  SET status = 'restored', restored_at = now(), restored_by = p_actor
  WHERE id = p_import_history_id;

  DELETE FROM public.import_batch_recycle_bin
  WHERE import_history_id = p_import_history_id;

  RETURN restored_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.permanently_delete_import_batch(p_import_history_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.import_history
    WHERE id = p_import_history_id AND status = 'deleted'
  ) THEN
    RAISE EXCEPTION 'Only a deleted import can be permanently removed from the recycle bin.';
  END IF;

  DELETE FROM public.import_batch_recycle_bin WHERE import_history_id = p_import_history_id;
  DELETE FROM public.import_reversal_snapshots WHERE import_history_id = p_import_history_id;
END;
$$;
