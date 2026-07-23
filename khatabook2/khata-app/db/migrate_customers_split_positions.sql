-- Split route_position into two independent ordering fields:
--   matrix_position     → used by Distribution Matrix / Catalogue Preview
--   collection_position  → used by Collection Route Editor / employee collection queue
--
-- Run this SQL in the Supabase SQL editor.

-- 1. Add the new columns
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS matrix_position INTEGER;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collection_position INTEGER;

-- 2. Copy existing route_position into both new columns so nothing breaks
UPDATE public.customers
SET matrix_position    = route_position,
    collection_position = route_position
WHERE route_position IS NOT NULL;

-- 3. For any customers without a route_position, assign sequential defaults
UPDATE public.customers
SET matrix_position = ranked.rn,
    collection_position = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.customers
  WHERE matrix_position IS NULL
) AS ranked
WHERE customers.id = ranked.id;

-- 4. Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_matrix_position    ON public.customers (matrix_position);
CREATE INDEX IF NOT EXISTS idx_customers_collection_position ON public.customers (collection_position);

-- 5. (Optional) Drop the old column once you've verified everything works
-- ALTER TABLE public.customers DROP COLUMN route_position;
