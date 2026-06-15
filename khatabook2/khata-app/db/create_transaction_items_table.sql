-- Run this in the Supabase SQL editor

-- Phase 1: Create transaction_items table to store sold products

CREATE TABLE IF NOT EXISTS public.transaction_items (
  id serial PRIMARY KEY,
  transaction_id integer REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id integer REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  price numeric NOT NULL,  -- Price at time of sale (in case product price changes later)
  created_at timestamptz DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS transaction_items_transaction_id_idx ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_items_product_id_idx ON public.transaction_items(product_id);
