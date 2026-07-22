-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sale_price numeric DEFAULT 0,
  purchase_price numeric DEFAULT 0,
  stock_quantity numeric DEFAULT 0,
  low_stock_limit numeric DEFAULT 0,
  unit text DEFAULT 'PCS',
  image_url text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_transactions (
  id serial PRIMARY KEY,
  product_id integer REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'stock_in', 'stock_out'
  quantity numeric NOT NULL,
  price numeric,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  import_history_id uuid,
  stock_applied boolean NOT NULL DEFAULT true
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS products_created_at_idx ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS product_transactions_product_id_idx ON public.product_transactions(product_id);
CREATE INDEX IF NOT EXISTS product_transactions_import_history_id_idx ON public.product_transactions(import_history_id);
