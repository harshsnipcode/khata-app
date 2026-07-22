-- Rebuild every product's displayed stock from the inventory ledger.
--
-- This is catalogue-wide: no product ids or product names are special-cased.
-- It uses the movement model shown in Product Detail stock history:
--   product_transactions.stock_in  => +quantity
--   product_transactions.stock_out => -quantity
--
-- Products with no movement history are left unchanged.

ALTER TABLE public.product_transactions
  ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.preview_product_inventory_from_ledger()
RETURNS TABLE(
  product_id integer,
  product_name text,
  current_stock numeric,
  ledger_stock numeric,
  delta numeric
)
LANGUAGE sql
AS $$
  WITH movements AS (
    SELECT
      pt.product_id,
      SUM(
        CASE
          WHEN pt.type = 'stock_in' THEN COALESCE(pt.quantity, 0)
          WHEN pt.type = 'stock_out' THEN -COALESCE(pt.quantity, 0)
          ELSE 0
        END
      ) AS quantity
    FROM public.product_transactions pt
    GROUP BY pt.product_id

  ),
  totals AS (
    SELECT product_id, SUM(quantity) AS ledger_stock
    FROM movements
    GROUP BY product_id
  )
  SELECT
    p.id,
    p.name,
    COALESCE(p.stock_quantity, 0),
    totals.ledger_stock,
    totals.ledger_stock - COALESCE(p.stock_quantity, 0)
  FROM public.products p
  JOIN totals ON totals.product_id = p.id
  ORDER BY p.id;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_product_inventory_from_ledger()
RETURNS TABLE(
  product_id integer,
  product_name text,
  previous_stock numeric,
  reconciled_stock numeric,
  delta numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT
      pt.product_id,
      SUM(
        CASE
          WHEN pt.type = 'stock_in' THEN COALESCE(pt.quantity, 0)
          WHEN pt.type = 'stock_out' THEN -COALESCE(pt.quantity, 0)
          ELSE 0
        END
      ) AS quantity
    FROM public.product_transactions pt
    GROUP BY pt.product_id

  ),
  totals AS (
    SELECT product_id, SUM(quantity) AS ledger_stock
    FROM movements
    GROUP BY product_id
  ),
  product_rows AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.stock_quantity, 0) AS previous_stock,
      totals.ledger_stock AS reconciled_stock
    FROM public.products p
    JOIN totals ON totals.product_id = p.id
  ),
  updated_products AS (
    UPDATE public.products p
    SET stock_quantity = product_rows.reconciled_stock,
        updated_at = now()
    FROM product_rows
    WHERE p.id = product_rows.id
      AND COALESCE(p.stock_quantity, 0) IS DISTINCT FROM product_rows.reconciled_stock
    RETURNING p.id
  ),
  marked_product_transactions AS (
    UPDATE public.product_transactions pt
    SET stock_applied = true
    FROM product_rows
    WHERE pt.product_id = product_rows.id
      AND COALESCE(pt.stock_applied, false) = false
    RETURNING pt.id
  )
  SELECT
    product_rows.id,
    product_rows.name,
    product_rows.previous_stock,
    product_rows.reconciled_stock,
    product_rows.reconciled_stock - product_rows.previous_stock
  FROM product_rows
  ORDER BY product_rows.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_product_inventory_from_ledger()
TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reconcile_product_inventory_from_ledger()
TO anon, authenticated, service_role;

-- Review first:
-- SELECT * FROM public.preview_product_inventory_from_ledger()
-- WHERE delta <> 0;
--
-- Apply once reviewed:
-- SELECT * FROM public.reconcile_product_inventory_from_ledger();

NOTIFY pgrst, 'reload schema';
