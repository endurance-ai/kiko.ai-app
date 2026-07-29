-- products.id was migrated from uuid to bigint in migration 070.
-- Migration 092 accidentally retained the legacy uuid recordset type, causing
-- every representative-image apply batch to fail before updating any rows.

BEGIN;

CREATE OR REPLACE FUNCTION apply_product_image_selections(selections jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(selections) AS x(
      id bigint,
      before_url text,
      after_url text,
      source_image_url text,
      images text[],
      kind text,
      score real,
      version text,
      candidate_count integer,
      selected_at timestamptz
    )
  )
  UPDATE products AS p
  SET
    image_url = input.after_url,
    source_image_url = COALESCE(NULLIF(input.source_image_url, ''), p.source_image_url, p.image_url),
    images = (input.images)[1:10],
    image_selection_kind = input.kind,
    image_selection_score = input.score,
    image_selection_version = input.version,
    image_selection_candidate_count = input.candidate_count,
    image_selected_at = input.selected_at,
    updated_at = now()
  FROM input
  WHERE p.id = input.id
    AND p.image_url IS NOT DISTINCT FROM input.before_url
    AND input.after_url ~* '^https?://'
    AND input.kind IN ('model', 'product', 'fallback')
    AND input.score BETWEEN 0 AND 100
    AND input.candidate_count BETWEEN 1 AND 10
    AND length(input.version) > 0;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION apply_product_image_selections(jsonb) IS
  'Optimistic batch apply for crawler mac-vision representative-image manifests using bigint product IDs.';

GRANT EXECUTE ON FUNCTION apply_product_image_selections(jsonb) TO app_user;

COMMIT;
