-- Atomic stock adjustment used by both manual Stock In/Out and Excel Stock In.
-- Run this in the Supabase SQL Editor.
--
-- This avoids stale client reads by doing the increment/decrement inside
-- PostgreSQL while the product row is locked.

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

CREATE OR REPLACE FUNCTION public.create_product_stock_adjustment(
  p_product_id integer,
  p_type text,
  p_quantity numeric,
  p_price numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_import_history_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  previous_stock numeric;
  updated_product public.products;
  created_product_transaction public.product_transactions;
BEGIN
  IF p_type NOT IN ('stock_in', 'stock_out') THEN
    RAISE EXCEPTION 'Invalid stock adjustment type: %', p_type;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive number.';
  END IF;

  IF p_import_history_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.import_history WHERE id = p_import_history_id)
  THEN
    RAISE EXCEPTION 'Import history % does not exist', p_import_history_id;
  END IF;

  SELECT COALESCE(stock_quantity, 0)
  INTO previous_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist', p_product_id;
  END IF;

  INSERT INTO public.product_transactions (
    product_id,
    type,
    quantity,
    price,
    notes,
    created_by,
    created_at,
    import_history_id,
    stock_applied
  )
  SELECT
    p_product_id,
    p_type,
    p_quantity,
    COALESCE(p_price, CASE WHEN p_type = 'stock_in' THEN purchase_price ELSE sale_price END, 0),
    NULLIF(BTRIM(p_notes), ''),
    p_created_by,
    COALESCE(p_created_at, now()),
    p_import_history_id,
    true
  FROM public.products
  WHERE id = p_product_id
  RETURNING * INTO created_product_transaction;

  UPDATE public.products
  SET stock_quantity = CASE
        WHEN p_type = 'stock_in' THEN COALESCE(stock_quantity, 0) + p_quantity
        ELSE COALESCE(stock_quantity, 0) - p_quantity
      END,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO updated_product;

  RETURN jsonb_build_object(
    'previous_stock', previous_stock,
    'new_stock', updated_product.stock_quantity,
    'product', to_jsonb(updated_product),
    'product_transaction', to_jsonb(created_product_transaction)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product_stock_adjustment(
  integer, text, numeric, numeric, text, text, timestamptz, uuid
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
