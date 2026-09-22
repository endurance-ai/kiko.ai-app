-- Defer image-derived catalog work while a product is out of stock, resume it
-- on restock, and expose one operational health snapshot for the batch host.

BEGIN;

-- Candidate discovery is enabled again by the refresh crawl. Revive only the
-- rows rejected by the former existing-product-only policy; user/data-quality
-- rejections remain terminal.
UPDATE public.product_refresh_candidates
SET status = CASE
      WHEN matched_brand_node_id IS NULL THEN 'brand_unmatched'
      ELSE 'discovered'
    END,
    attempt_count = 0,
    next_attempt_at = NULL,
    processing_token = NULL,
    processing_observation_revision = NULL,
    processing_max_age_hours = NULL,
    lease_expires_at = NULL,
    last_error = NULL,
    last_error_code = NULL,
    updated_at = now()
WHERE status = 'rejected'
  AND last_error_code = 'source_existing_only';

ALTER TABLE public.product_catalog_jobs
  DROP CONSTRAINT IF EXISTS product_catalog_jobs_status_check;
ALTER TABLE public.product_catalog_jobs
  ADD CONSTRAINT product_catalog_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'retry', 'complete', 'quarantined', 'deferred'));

CREATE OR REPLACE FUNCTION public.enqueue_product_catalog_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (
    OLD.platform                IS DISTINCT FROM NEW.platform OR
    OLD.brand_node_id           IS DISTINCT FROM NEW.brand_node_id OR
    OLD.brand                   IS DISTINCT FROM NEW.brand OR
    OLD.name                    IS DISTINCT FROM NEW.name OR
    OLD.category                IS DISTINCT FROM NEW.category OR
    OLD.product_code            IS DISTINCT FROM NEW.product_code OR
    OLD.image_url               IS DISTINCT FROM NEW.image_url OR
    OLD.images                  IS DISTINCT FROM NEW.images OR
    OLD.image_selection_version IS DISTINCT FROM NEW.image_selection_version OR
    OLD.image_selected_at       IS DISTINCT FROM NEW.image_selected_at OR
    OLD.in_stock                IS DISTINCT FROM NEW.in_stock
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_catalog_jobs (product_id, platform, status)
  VALUES (NEW.id, NEW.platform, CASE WHEN NEW.in_stock THEN 'pending' ELSE 'deferred' END)
  ON CONFLICT (product_id) DO UPDATE
  SET platform = EXCLUDED.platform,
      generation = product_catalog_jobs.generation + 1,
      status = CASE WHEN NEW.in_stock THEN 'pending' ELSE 'deferred' END,
      attempts = 0,
      available_at = now(),
      lease_expires_at = NULL,
      last_error = CASE WHEN NEW.in_stock THEN NULL ELSE 'waiting for product restock' END,
      requested_at = now(),
      completed_at = NULL,
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_enqueue_catalog_job ON public.products;
CREATE TRIGGER trg_products_enqueue_catalog_job
AFTER INSERT OR UPDATE OF
  platform, brand_node_id, brand, name, category, product_code,
  image_url, images, image_selection_version, image_selected_at, in_stock
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enqueue_product_catalog_job();

CREATE OR REPLACE FUNCTION public.retry_product_catalog_job(
  p_product_id bigint,
  p_generation bigint,
  p_error text,
  p_max_attempts integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.product_catalog_jobs AS job
  SET status = CASE
        WHEN NOT product.in_stock THEN 'deferred'
        WHEN job.attempts >= greatest(1, p_max_attempts) THEN 'quarantined'
        ELSE 'retry'
      END,
      available_at = now() + make_interval(secs => least(3600, 60 * greatest(1, job.attempts))),
      lease_expires_at = NULL,
      last_error = CASE
        WHEN NOT product.in_stock THEN 'waiting for product restock'
        ELSE left(coalesce(p_error, 'unknown catalog pipeline failure'), 2000)
      END,
      updated_at = now()
  FROM public.products AS product
  WHERE job.product_id = p_product_id
    AND product.id = job.product_id
    AND job.generation = p_generation
    AND job.status = 'processing';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;

-- Existing out-of-stock jobs should stop consuming retries immediately.
UPDATE public.product_catalog_jobs AS job
SET status = 'deferred', attempts = 0, lease_expires_at = NULL,
    last_error = 'waiting for product restock', updated_at = now()
FROM public.products AS product
WHERE product.id = job.product_id
  AND NOT product.in_stock
  AND job.status <> 'deferred';

-- Recover the known pre-migration failure mode once for products already back
-- in stock before this trigger existed.
UPDATE public.product_catalog_jobs AS job
SET status = 'pending', attempts = 0, available_at = now(),
    lease_expires_at = NULL, last_error = NULL, requested_at = now(), updated_at = now()
FROM public.products AS product
WHERE product.id = job.product_id
  AND product.in_stock
  AND job.status = 'quarantined'
  AND job.last_error ILIKE '%embedding%missing%';

CREATE OR REPLACE FUNCTION public.product_pipeline_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidate_counts AS (
    SELECT status, count(*)::bigint AS count
    FROM public.product_refresh_candidates
    GROUP BY status
  ), catalog_counts AS (
    SELECT status, count(*)::bigint AS count
    FROM public.product_catalog_jobs
    GROUP BY status
  ), asset_counts AS (
    SELECT
      count(*) FILTER (WHERE p.in_stock)::bigint AS in_stock,
      count(*) FILTER (WHERE p.in_stock AND p.first_seen_at >= now() - interval '24 hours')::bigint AS products_added_24h,
      count(*) FILTER (WHERE p.in_stock AND (p.image_selection_version IS NULL OR p.image_selected_at IS NULL))::bigint AS image_pending,
      count(*) FILTER (WHERE p.in_stock AND NOT EXISTS (
        SELECT 1 FROM public.product_offers AS offer WHERE offer.source_product_id = p.id
      ))::bigint AS catalog_identity_pending,
      count(*) FILTER (WHERE p.in_stock AND feature.product_id IS NULL)::bigint AS feature_pending,
      count(*) FILTER (WHERE p.in_stock AND embedding.product_id IS NULL)::bigint AS embedding_pending,
      count(*) FILTER (WHERE p.in_stock AND p.image_selection_version IS NOT NULL
        AND p.image_selected_at IS NOT NULL AND feature.product_id IS NOT NULL
        AND embedding.product_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.product_offers AS offer WHERE offer.source_product_id = p.id
        ))::bigint AS search_ready
    FROM public.products AS p
    LEFT JOIN public.product_features AS feature ON feature.product_id = p.id
    LEFT JOIN public.product_embeddings AS embedding ON embedding.product_id = p.id
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'candidate_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM candidate_counts), '{}'::jsonb),
    'catalog_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM catalog_counts), '{}'::jsonb),
    'candidate_oldest_wait_seconds', COALESCE((SELECT floor(extract(epoch FROM now() - min(first_seen_at)))::bigint
      FROM public.product_refresh_candidates WHERE status IN ('discovered','failed','enriching','ready')), 0),
    'catalog_oldest_wait_seconds', COALESCE((SELECT floor(extract(epoch FROM now() - min(requested_at)))::bigint
      FROM public.product_catalog_jobs WHERE status IN ('pending','retry','processing')), 0),
    'assets', (SELECT to_jsonb(asset_counts) FROM asset_counts)
  );
$$;

REVOKE ALL ON FUNCTION public.product_pipeline_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_pipeline_health() TO app_user;
GRANT EXECUTE ON FUNCTION public.retry_product_catalog_job(bigint, bigint, text, integer) TO app_user;

NOTIFY pgrst, 'reload schema';

COMMIT;
