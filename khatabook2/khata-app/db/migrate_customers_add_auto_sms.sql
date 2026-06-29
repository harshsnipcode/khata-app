ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auto_sms_enabled boolean DEFAULT false;
