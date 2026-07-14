-- Run this SQL in the Supabase SQL editor to add optional product grouping.
-- Product groups are metadata only and do not affect stock, pricing, reports, or transactions.

CREATE TABLE IF NOT EXISTS public.product_groups (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS group_id integer REFERENCES public.product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_groups_name_idx ON public.product_groups(name);
CREATE INDEX IF NOT EXISTS products_group_id_idx ON public.products(group_id);
