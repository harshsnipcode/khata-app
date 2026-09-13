-- Add transactions to the Realtime publication so postgres_changes events
-- (INSERT / UPDATE / DELETE) actually fire for the transactions table.
--
-- Without this, /admin/home can subscribe successfully but never receive the
-- transaction DELETE event from another device. The live-sync full reconcile
-- still repairs missed events, but realtime should be the first path.
--
-- Run this once in the Supabase SQL editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END
$$;
