-- Adds a uniquely named RPC for Excel-imported customer transactions.
-- This avoids PostgREST ambiguity when public.create_gave_transaction has
-- multiple overloaded signatures.

CREATE OR REPLACE FUNCTION public.create_import_gave_transaction(
  p_customer_id integer,
  p_items jsonb,
  p_amount numeric,
  p_created_by text,
  p_created_at timestamptz,
  p_import_history_id uuid,
  p_description text DEFAULT NULL
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
    customer_id, type, amount, description, created_by, created_at, import_history_id
  )
  VALUES (
    p_customer_id, 'gave', p_amount,
    NULLIF(BTRIM(p_description), ''), p_created_by,
    p_created_at, p_import_history_id
  )
  RETURNING * INTO created_transaction;

  FOR item_record IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS item(product_id integer, quantity numeric, price numeric)
  LOOP
    INSERT INTO public.transaction_items (
      transaction_id, product_id, quantity, price
    )
    VALUES (
      created_transaction.id, item_record.product_id,
      item_record.quantity, item_record.price
    );

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

GRANT EXECUTE ON FUNCTION public.create_import_gave_transaction(
  integer, jsonb, numeric, text, timestamptz, uuid, text
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
