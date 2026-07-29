-- Automated product representative-image selection.
--
-- image_url remains the serving/search SOT. source_image_url preserves the
-- crawler-provided primary URL so a later import or rollback cannot lose it.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_image_url text,
  ADD COLUMN IF NOT EXISTS image_selection_kind text,
  ADD COLUMN IF NOT EXISTS image_selection_score real,
  ADD COLUMN IF NOT EXISTS image_selection_version text,
  ADD COLUMN IF NOT EXISTS image_selection_candidate_count smallint,
  ADD COLUMN IF NOT EXISTS image_selected_at timestamptz;

UPDATE products
SET source_image_url = image_url
WHERE source_image_url IS NULL
  AND image_url IS NOT NULL;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_image_selection_kind_check,
  ADD CONSTRAINT products_image_selection_kind_check
    CHECK (image_selection_kind IS NULL OR image_selection_kind IN ('model', 'product', 'fallback')),
  DROP CONSTRAINT IF EXISTS products_image_selection_score_check,
  ADD CONSTRAINT products_image_selection_score_check
    CHECK (image_selection_score IS NULL OR image_selection_score BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS products_image_selection_candidate_count_check,
  ADD CONSTRAINT products_image_selection_candidate_count_check
    CHECK (
      image_selection_candidate_count IS NULL
      OR image_selection_candidate_count BETWEEN 1 AND 10
    );

CREATE INDEX IF NOT EXISTS idx_products_image_selection_version
  ON products (image_selection_version);

COMMENT ON COLUMN products.source_image_url IS
  'Latest crawler-provided primary image before local representative-image selection.';
COMMENT ON COLUMN products.image_selection_kind IS
  'mac-vision selector result: model, product, or fallback.';
COMMENT ON COLUMN products.image_selection_score IS
  'Deterministic representative-image quality score in the range 0..100.';
COMMENT ON COLUMN products.image_selection_version IS
  'Selector policy/model version; NULL means not processed.';
COMMENT ON COLUMN products.image_selection_candidate_count IS
  'Number of image candidates evaluated by the selector (1..10).';
COMMENT ON COLUMN products.image_selected_at IS
  'Time the current representative image was selected.';

ALTER TABLE product_collection_runs
  DROP CONSTRAINT IF EXISTS product_collection_runs_stage_check;
ALTER TABLE product_collection_runs
  ADD CONSTRAINT product_collection_runs_stage_check
  CHECK (stage IN ('detect','config','crawl','image_select','qc','import','embed','manual'));

CREATE OR REPLACE FUNCTION apply_product_image_selections(selections jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF jsonb_typeof(selections) <> 'array' THEN
    RAISE EXCEPTION 'selections must be a JSON array';
  END IF;

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
  'Optimistic batch apply for crawler mac-vision representative-image manifests.';

GRANT EXECUTE ON FUNCTION apply_product_image_selections(jsonb) TO app_user;

COMMIT;
