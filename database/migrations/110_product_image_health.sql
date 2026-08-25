-- Canonical product-image health and repair workflow.
--
-- products.image_url is the serving/search SOT. products.images is a gallery
-- whose first entry mirrors image_url for compatibility; it must never
-- override image_url when choosing an embedding source.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_image_failures (
  product_id       bigint PRIMARY KEY
                   REFERENCES public.products(id) ON DELETE CASCADE,
  failed_url       text NOT NULL CHECK (length(btrim(failed_url)) > 0),
  failure_kind     text NOT NULL CHECK (failure_kind IN (
                     'http_403', 'http_404', 'http_410', 'http_429',
                     'http_5xx', 'timeout', 'network', 'non_image',
                     'decode', 'unknown'
                   )),
  disposition      text NOT NULL CHECK (disposition IN ('retryable', 'permanent')),
  http_status      integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  attempt_count    integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  first_failed_at  timestamptz NOT NULL DEFAULT now(),
  last_failed_at   timestamptz NOT NULL DEFAULT now(),
  next_retry_at    timestamptz,
  last_error       text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (disposition = 'permanent' OR next_retry_at IS NOT NULL)
);

DROP TRIGGER IF EXISTS trg_product_image_failures_updated_at
  ON public.product_image_failures;
CREATE TRIGGER trg_product_image_failures_updated_at
  BEFORE UPDATE ON public.product_image_failures
  FOR EACH ROW
  EXECUTE FUNCTION public.style_nodes_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_image_failures_retry
  ON public.product_image_failures (next_retry_at, product_id)
  WHERE disposition = 'retryable';

COMMENT ON TABLE public.product_image_failures IS
  'Durable image-download failure state. A row applies only while products.image_url equals failed_url.';
COMMENT ON COLUMN public.product_image_failures.disposition IS
  'retryable failures become pending at next_retry_at; permanent failures remain quarantined until image_url changes.';

CREATE OR REPLACE FUNCTION public.align_product_image_gallery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  valid_images text[];
BEGIN
  IF NEW.image_url IS NOT NULL AND NEW.image_url !~* '^https?://' THEN
    IF NEW.source_image_url IS NOT DISTINCT FROM NEW.image_url THEN
      NEW.source_image_url := NULL;
    END IF;
    NEW.image_url := NULL;
  END IF;
  IF NEW.source_image_url IS NOT NULL AND NEW.source_image_url !~* '^https?://' THEN
    NEW.source_image_url := NULL;
  END IF;

  SELECT ARRAY(
    SELECT candidate
    FROM (
      SELECT candidate, min(ord) AS first_ord
      FROM unnest(COALESCE(NEW.images, ARRAY[]::text[]))
        WITH ORDINALITY AS image(candidate, ord)
      WHERE candidate ~* '^https?://'
        AND candidate IS DISTINCT FROM NEW.image_url
      GROUP BY candidate
    ) AS unique_candidates
    ORDER BY first_ord
  ) INTO valid_images;

  IF NEW.image_url ~* '^https?://' THEN
    NEW.images := ARRAY[NEW.image_url] || valid_images;
  ELSE
    NEW.images := valid_images;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_align_image_gallery ON public.products;
CREATE TRIGGER trg_products_align_image_gallery
  BEFORE INSERT OR UPDATE OF image_url, source_image_url, images ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.align_product_image_gallery();

-- One-time repair for legacy rows whose gallery and canonical representative
-- drifted apart. Updating images only does not invalidate derived assets.
UPDATE public.products
SET
  image_url = image_url,
  source_image_url = source_image_url,
  images = images
WHERE (
    image_url ~* '^https?://'
    AND (
      cardinality(images) IS NULL
      OR images[1] IS DISTINCT FROM image_url
    )
  )
  OR (image_url IS NOT NULL AND image_url !~* '^https?://')
  OR (source_image_url IS NOT NULL AND source_image_url !~* '^https?://')
  OR EXISTS (
    SELECT 1
    FROM unnest(COALESCE(images, ARRAY[]::text[])) AS image(candidate)
    WHERE candidate !~* '^https?://'
  );

COMMENT ON FUNCTION public.align_product_image_gallery() IS
  'Keeps images[0] as a compatibility mirror of canonical image_url and removes malformed gallery entries.';

CREATE OR REPLACE FUNCTION public.invalidate_product_image_assets_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM product_embeddings WHERE product_id = NEW.id;
  DELETE FROM product_features WHERE product_id = NEW.id;
  DELETE FROM product_image_failures WHERE product_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_image_url_invalidate_assets ON public.products;
CREATE TRIGGER trg_products_image_url_invalidate_assets
  AFTER UPDATE ON public.products
  FOR EACH ROW
  WHEN (OLD.image_url IS DISTINCT FROM NEW.image_url)
  EXECUTE FUNCTION public.invalidate_product_image_assets_on_change();

COMMENT ON FUNCTION public.invalidate_product_image_assets_on_change() IS
  'Invalidates embeddings, VLM features, and stale failure state whenever canonical products.image_url changes.';

CREATE OR REPLACE FUNCTION public.record_product_image_failure(
  p_product_id bigint,
  p_failed_url text,
  p_failure_kind text,
  p_disposition text,
  p_http_status integer DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL,
  p_last_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  recorded_attempt_count integer;
BEGIN
  INSERT INTO product_image_failures (
    product_id,
    failed_url,
    failure_kind,
    disposition,
    http_status,
    next_retry_at,
    last_error
  )
  VALUES (
    p_product_id,
    p_failed_url,
    p_failure_kind,
    p_disposition,
    p_http_status,
    p_next_retry_at,
    left(p_last_error, 2000)
  )
  ON CONFLICT (product_id) DO UPDATE SET
    failed_url = EXCLUDED.failed_url,
    failure_kind = EXCLUDED.failure_kind,
    disposition = EXCLUDED.disposition,
    http_status = EXCLUDED.http_status,
    attempt_count = CASE
      WHEN product_image_failures.failed_url = EXCLUDED.failed_url
        THEN product_image_failures.attempt_count + 1
      ELSE 1
    END,
    first_failed_at = CASE
      WHEN product_image_failures.failed_url = EXCLUDED.failed_url
        THEN product_image_failures.first_failed_at
      ELSE now()
    END,
    last_failed_at = now(),
    next_retry_at = EXCLUDED.next_retry_at,
    last_error = EXCLUDED.last_error
  RETURNING attempt_count INTO recorded_attempt_count;

  RETURN recorded_attempt_count;
END;
$$;

COMMENT ON FUNCTION public.record_product_image_failure(bigint, text, text, text, integer, timestamptz, text) IS
  'Upserts product image failure state and resets attempts when the canonical image_url changes.';

CREATE OR REPLACE FUNCTION public.clear_product_image_failure(
  p_product_id bigint,
  p_succeeded_url text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM product_image_failures
  WHERE product_id = p_product_id
    AND (
      p_succeeded_url IS NULL
      OR failed_url = p_succeeded_url
      OR EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = p_product_id AND p.image_url = p_succeeded_url
      )
    );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.clear_product_image_failure(bigint, text) IS
  'Clears stale image failure state after the same canonical URL succeeds.';

CREATE OR REPLACE FUNCTION public.repair_product_image_assets(repairs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
  changed_ids bigint[];
  resolved_ids bigint[];
BEGIN
  IF jsonb_typeof(repairs) <> 'array' THEN
    RAISE EXCEPTION 'repairs must be a JSON array';
  END IF;

  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(repairs) AS x(
      id bigint,
      before_url text,
      replacement_url text,
      source_image_url text,
      images text[],
      bad_urls text[],
      mark_out_of_stock boolean
    )
  ),
  cleaned AS (
    SELECT
      input.*,
      ARRAY(
        SELECT candidate
        FROM (
          SELECT candidate, min(ord) AS first_ord
          FROM unnest(COALESCE(input.images, ARRAY[]::text[]))
            WITH ORDINALITY AS image(candidate, ord)
          WHERE candidate ~* '^https?://'
            AND NOT candidate = ANY(COALESCE(input.bad_urls, ARRAY[]::text[]))
          GROUP BY candidate
        ) AS unique_candidates
        ORDER BY first_ord
      ) AS valid_images
    FROM input
  ),
  prepared AS (
    SELECT
      cleaned.*,
      CASE
        WHEN replacement_url IS NULL THEN valid_images
        ELSE ARRAY[replacement_url] || array_remove(valid_images, replacement_url)
      END AS ordered_images,
      CASE
        WHEN source_image_url ~* '^https?://'
          AND NOT source_image_url = ANY(COALESCE(bad_urls, ARRAY[]::text[]))
          THEN source_image_url
        ELSE NULL
      END AS valid_source_image_url
    FROM cleaned
    WHERE replacement_url IS NULL
       OR (
         replacement_url ~* '^https?://'
         AND NOT replacement_url = ANY(COALESCE(bad_urls, ARRAY[]::text[]))
       )
  ),
  updated AS (
    UPDATE products AS p
    SET
      image_url = prepared.replacement_url,
      source_image_url = prepared.valid_source_image_url,
      images = prepared.ordered_images,
      in_stock = CASE
        WHEN COALESCE(prepared.mark_out_of_stock, false) THEN false
        ELSE p.in_stock
      END,
      updated_at = now()
    FROM prepared
    WHERE p.id = prepared.id
      AND p.image_url IS NOT DISTINCT FROM prepared.before_url
    RETURNING
      p.id,
      prepared.before_url IS DISTINCT FROM prepared.replacement_url AS representative_changed,
      prepared.replacement_url IS NOT NULL AS resolved
  )
  SELECT
    count(*)::integer,
    array_agg(id) FILTER (WHERE representative_changed),
    array_agg(id) FILTER (WHERE resolved)
  INTO updated_count, changed_ids, resolved_ids
  FROM updated;

  IF cardinality(changed_ids) > 0 THEN
    DELETE FROM product_embeddings
    WHERE product_id = ANY(changed_ids);

    DELETE FROM product_features
    WHERE product_id = ANY(changed_ids);
  END IF;

  IF cardinality(resolved_ids) > 0 THEN
    DELETE FROM product_image_failures
    WHERE product_id = ANY(resolved_ids);
  END IF;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.repair_product_image_assets(jsonb) IS
  'Optimistically removes confirmed-bad URLs, promotes a verified image_url, keeps images[0] aligned, and invalidates image-derived assets.';

COMMENT ON COLUMN public.product_embeddings.embedding IS
  'halfvec(768), FashionSigLIP image embedding of products.image_url, L2-normalized.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_image_failures TO app_user;
GRANT EXECUTE ON FUNCTION public.record_product_image_failure(bigint, text, text, text, integer, timestamptz, text) TO app_user;
GRANT EXECUTE ON FUNCTION public.clear_product_image_failure(bigint, text) TO app_user;
GRANT EXECUTE ON FUNCTION public.repair_product_image_assets(jsonb) TO app_user;

COMMIT;
