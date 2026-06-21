CREATE TABLE IF NOT EXISTS public.business_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.business_settings (id, settings, updated_at)
VALUES (1, '{}', now())
ON CONFLICT (id) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_settings;
