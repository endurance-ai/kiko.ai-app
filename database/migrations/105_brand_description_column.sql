-- Make the service-facing brand description directly queryable while keeping
-- provenance and other enrichment metadata in brand_nodes.wiki.

ALTER TABLE public.brand_nodes
  ADD COLUMN IF NOT EXISTS description text;

UPDATE public.brand_nodes
SET description = COALESCE(
  NULLIF(btrim(description), ''),
  NULLIF(btrim(wiki->>'description_ko'), ''),
  NULLIF(btrim(wiki->>'description_original'), '')
)
WHERE NULLIF(btrim(description), '') IS NULL
  AND (
    NULLIF(btrim(wiki->>'description_ko'), '') IS NOT NULL
    OR NULLIF(btrim(wiki->>'description_original'), '') IS NOT NULL
  );

UPDATE public.brand_nodes
SET wiki = wiki - ARRAY['description_ko', 'description_original']::text[]
WHERE wiki ?| ARRAY['description_ko', 'description_original'];

COMMENT ON COLUMN public.brand_nodes.description IS
  'Service-facing brand description. Backfilled from wiki description_ko, falling back to description_original.';

NOTIFY pgrst, 'reload schema';
