-- Separates the business date from the activity timestamp.
--
-- `created_at` continues to hold the business date (+ the time-of-day the user
-- entered, used for display). `activity_at` is the actual system timestamp when
-- the transaction was created or last edited. It is used ONLY for ordering so
-- that a backdated transaction entered today sorts above older same-day entries.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS activity_at timestamptz DEFAULT now();

-- Existing rows: use their current created_at as the best-known activity time.
UPDATE public.transactions
SET activity_at = created_at
WHERE activity_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_activity_at_idx
  ON public.transactions(activity_at DESC);
