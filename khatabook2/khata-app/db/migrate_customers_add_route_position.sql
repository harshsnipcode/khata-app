ALTER TABLE public.customers ADD COLUMN route_position INTEGER;
CREATE INDEX IF NOT EXISTS idx_customers_route_position ON public.customers (route_position);
UPDATE public.customers AS c
SET route_position = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.customers
) AS ranked
WHERE c.id = ranked.id;
