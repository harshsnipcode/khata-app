-- Migration: Add address, gstin, photo_url to customers table
-- Run this in the Supabase SQL Editor

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address   text,
  ADD COLUMN IF NOT EXISTS gstin     text,
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Optional: update the updated_at column automatically on any row change
-- (Only add trigger if you don't already have one)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
