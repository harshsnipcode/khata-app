-- Add customers to the Realtime publication so postgres_changes events
-- (INSERT / UPDATE / DELETE) actually fire for the customers table.
--
-- Without this, the realtime channel in /admin/home and /employee/home
-- subscribes successfully but NEVER receives customer events, so a customer
-- deleted on one device is only removed locally and never propagates to the
-- other devices.
--
-- Run this once in the Supabase SQL editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
END
$$;