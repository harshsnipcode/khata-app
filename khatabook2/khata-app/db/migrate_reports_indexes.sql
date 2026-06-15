CREATE INDEX IF NOT EXISTS transactions_type_idx ON public.transactions(type);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS balance_after_transaction NUMERIC;
