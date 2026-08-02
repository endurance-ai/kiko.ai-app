-- Preserve VLM product features when changing a representative product image.

BEGIN;

CREATE OR REPLACE FUNCTION apply_product_image_selections(selections jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
  changed_ids bigint[];
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
  ),
  updated AS (
    UPDATE products AS p
    SET
      image_url = input.after_url,
      source_image_url = COALESCE(NULLIF(input.source_image_url, ''), p.source_image_url, p.image_url),
      images = input.images,
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
      AND input.candidate_count > 0
      AND length(input.version) > 0
    RETURNING p.id, input.before_url IS DISTINCT FROM input.after_url AS representative_changed
  )
  SELECT
    count(*)::integer,
    array_agg(id) FILTER (WHERE representative_changed)
  INTO updated_count, changed_ids
  FROM updated;

  IF cardinality(changed_ids) > 0 THEN
    DELETE FROM product_embeddings
    WHERE product_id = ANY(changed_ids);
  END IF;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION apply_product_image_selections(jsonb) IS
  'Applies unbounded image arrays, invalidates changed-image embeddings, and preserves product features.';

GRANT EXECUTE ON FUNCTION apply_product_image_selections(jsonb) TO app_user;

COMMIT;
