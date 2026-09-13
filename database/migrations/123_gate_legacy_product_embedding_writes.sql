-- Post-rollout gate: apply only after every embedding caller uses the v2 RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_stale_product_embeddings_v2(p_product_ids jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF jsonb_typeof(p_product_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_product_ids must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_product_ids) > 1000 THEN
    RAISE EXCEPTION 'p_product_ids must contain at most 1000 items' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_product_ids) requested(value)
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
       OR COALESCE(value #>> '{}', '') !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'p_product_ids must contain decimal-string product ids'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_product_ids) requested(value)
    GROUP BY value::bigint
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'p_product_ids contains duplicate product ids' USING ERRCODE = '22023';
  END IF;

  -- The guarded writer and image mutations also lock products first. Keep the
  -- same order so invalidation classifies provenance against one current image
  -- generation and cannot delete a concurrently refreshed embedding.
  PERFORM 1
  FROM public.products p
  JOIN (
    SELECT value::bigint AS id
    FROM jsonb_array_elements_text(p_product_ids) requested(value)
  ) requested USING (id)
  ORDER BY p.id
  FOR UPDATE OF p;

  WITH input AS (
    SELECT ord, value::bigint AS id
    FROM jsonb_array_elements_text(p_product_ids) WITH ORDINALITY requested(value, ord)
  ), classified AS MATERIALIZED (
    SELECT input.ord, input.id,
      CASE
        WHEN p.id IS NULL OR e.product_id IS NULL THEN 'missing'
        WHEN e.source_image_url IS NOT NULL
         AND e.source_image_revision IS NOT NULL
         AND e.source_image_url IS NOT DISTINCT FROM p.image_url
         AND e.source_image_revision = p.image_revision THEN 'current'
        ELSE 'invalidated'
      END AS outcome
    FROM input
    LEFT JOIN public.products p USING (id)
    LEFT JOIN public.product_embeddings e ON e.product_id = input.id
  ), deleted AS (
    DELETE FROM public.product_embeddings e
    USING classified
    WHERE classified.outcome = 'invalidated'
      AND e.product_id = classified.id
    RETURNING e.product_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id::text, 'outcome', outcome
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_result
  FROM classified;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_product_embeddings(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_product_embeddings(jsonb) FROM app_user, ai_user;
REVOKE ALL ON FUNCTION public.invalidate_stale_product_embeddings_v2(jsonb) FROM PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON public.product_embeddings FROM app_user, ai_user;
GRANT SELECT ON public.product_embeddings TO app_user, ai_user;
GRANT EXECUTE ON FUNCTION public.bulk_update_product_embeddings_v2(jsonb) TO app_user, ai_user;
GRANT EXECUTE ON FUNCTION public.invalidate_stale_product_embeddings_v2(jsonb) TO app_user, ai_user;

COMMENT ON FUNCTION public.bulk_update_product_embeddings(jsonb) IS
  'RETIRED after v2 caller rollout. Normal roles cannot execute this provenance-free writer.';
COMMENT ON FUNCTION public.invalidate_stale_product_embeddings_v2(jsonb) IS
  'Deletes only legacy or stale embeddings whose provenance does not match the current product image generation.';

COMMIT;
