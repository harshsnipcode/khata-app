-- Run this SQL in the Supabase SQL editor to create the customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  type text DEFAULT 'customer',
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers(created_at DESC);
