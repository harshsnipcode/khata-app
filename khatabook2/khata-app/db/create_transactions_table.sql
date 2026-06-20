-- Run this SQL in the Supabase SQL editor to create the transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('gave', 'got')),
  amount numeric NOT NULL,
  description text,
  payment_mode text DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'online')),
  date date NOT NULL DEFAULT now(),
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON public.transactions(created_at DESC);

-- Run this ALTER TABLE for existing databases that already have the table
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'online'));
