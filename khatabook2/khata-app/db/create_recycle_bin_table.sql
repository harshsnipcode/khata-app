-- Global recycle bin for manual deletions (customers, products, transactions,
-- salary_payments). Mirrors the server-backed architecture already used by
-- Excel imports via public.import_batch_recycle_bin, so deleted records are
-- stored in a single source of truth visible on every device.
--
-- The app runs entirely client-side with the anon key and data tables have RLS
-- disabled (consistent with the other tables in this project). If RLS is ever
-- enabled, add policies below.
--
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text,
  original_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  restore_deadline timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS recycle_bin_deleted_at_idx
  ON public.recycle_bin (deleted_at DESC);

CREATE INDEX IF NOT EXISTS recycle_bin_entity_type_idx
  ON public.recycle_bin (entity_type);

-- The anon key performs all reads/writes (same as the other public tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recycle_bin TO anon, authenticated, service_role;

-- Realtime (supplementary). If the default publication exists, keep this table
-- in it so a change made on one device shows up on other devices live.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recycle_bin;
  END IF;
END $$;