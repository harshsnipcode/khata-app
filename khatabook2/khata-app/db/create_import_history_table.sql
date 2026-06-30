-- Run this migration in the Supabase SQL editor before using Bulk Excel Import.
CREATE TABLE IF NOT EXISTS public.import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploader text NOT NULL,
  file_hash text NOT NULL,
  sheet_name text,
  parsed_preview jsonb NOT NULL DEFAULT '[]'::jsonb,
  import_statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'completed_with_errors', 'failed')),
  is_reimport boolean NOT NULL DEFAULT false,
  source_import_id uuid REFERENCES public.import_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS import_history_uploaded_at_idx
  ON public.import_history(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS import_history_file_hash_idx
  ON public.import_history(file_hash);

-- Shared atomic implementation used by both manual and Excel "You Gave"
-- transactions. Existing installations without this function continue to use
-- the client-side transaction path until this migration is applied.
CREATE OR REPLACE FUNCTION public.create_gave_transaction(
  p_customer_id integer,
  p_items jsonb,
  p_amount numeric,
  p_created_by text,
  p_created_at timestamptz
)
RETURNS public.transactions
LANGUAGE plpgsql
AS $$
DECLARE
  created_transaction public.transactions;
  item_record record;
BEGIN
  INSERT INTO public.transactions (customer_id, type, amount, created_by, created_at)
  VALUES (p_customer_id, 'gave', p_amount, p_created_by, p_created_at)
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
