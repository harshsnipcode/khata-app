-- Repairs transaction amounts that were persisted before the shared rounding
-- rule existed. It applies the exact same calculation used by manual entry:
--
--   Math.round(unitPrice * quantity) summed per item
--
-- to every item-based transaction. Manual transactions already follow this rule
-- and are unaffected (the update is a no-op when the amount matches). Direct
-- entry "got" transactions have no items and are never touched.
--
-- Idempotent: safe to re-run at any time.

UPDATE public.transactions t
SET amount = rounded.rounded_total
FROM (
  SELECT
    i.transaction_id,
    SUM(ROUND(i.quantity * i.price)) AS rounded_total
  FROM public.transaction_items i
  GROUP BY i.transaction_id
) rounded
WHERE rounded.transaction_id = t.id
  AND t.amount IS DISTINCT FROM rounded.rounded_total;
