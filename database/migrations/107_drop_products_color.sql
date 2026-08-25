-- 107_drop_products_color.sql
-- 더 이상 쓰지 않는 크롤러 색상 컬럼을 제거한다.
-- 색상의 단일 출처는 migration 095 이후 product_features.primary_color 이다.

BEGIN;

-- 현재 함수 본문이 products.color 를 읽으므로 컬럼보다 먼저 제거한다.
-- 문자열 본문의 SQL 함수가 배포 후 런타임에서 뒤늦게 깨지는 것을 막는다.
DROP FUNCTION IF EXISTS public.admin_crawl_platform_stats();

ALTER TABLE public.products
  DROP COLUMN IF EXISTS color;

-- 기존 RPC 응답 계약은 유지하되 색상 채움률을 정본에서 집계한다.
CREATE FUNCTION public.admin_crawl_platform_stats()
RETURNS TABLE (
  platform text,
  sku_count bigint,
  in_stock_count bigint,
  last_crawled_at timestamptz,
  stale_count bigint,
  unembedded_count bigint,
  unbranded_count bigint,
  fill_description bigint,
  fill_color bigint,
  fill_tags bigint,
  fill_images bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.platform::text                                                                  AS platform,
    COUNT(*)::bigint                                                                  AS sku_count,
    COUNT(*) FILTER (WHERE p.in_stock)::bigint                                        AS in_stock_count,
    MAX(p.crawled_at)                                                                 AS last_crawled_at,
    COUNT(*) FILTER (
      WHERE p.crawled_at IS NULL OR p.crawled_at < now() - interval '30 days'
    )::bigint                                                                         AS stale_count,
    COUNT(*) FILTER (WHERE pe.product_id IS NULL)::bigint                             AS unembedded_count,
    COUNT(*) FILTER (WHERE p.brand_node_id IS NULL)::bigint                           AS unbranded_count,
    COUNT(*) FILTER (
      WHERE p.description IS NOT NULL AND p.description <> ''
    )::bigint                                                                         AS fill_description,
    COUNT(*) FILTER (
      WHERE NULLIF(BTRIM(pf.feature_metadata->>'primary_color'), '') IS NOT NULL
    )::bigint                                                                         AS fill_color,
    COUNT(*) FILTER (
      WHERE p.tags IS NOT NULL AND array_length(p.tags, 1) > 0
    )::bigint                                                                         AS fill_tags,
    COUNT(*) FILTER (
      WHERE p.images IS NOT NULL AND array_length(p.images, 1) > 0
    )::bigint                                                                         AS fill_images
  FROM public.products p
  LEFT JOIN public.product_embeddings pe ON pe.product_id = p.id
  LEFT JOIN public.product_features pf ON pf.product_id = p.id
  WHERE p.platform IS NOT NULL AND p.platform <> ''
  GROUP BY p.platform
  ORDER BY MAX(p.crawled_at) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.admin_crawl_platform_stats() IS
  '플랫폼별 크롤 모니터링 통계. 색상 채움률은 product_features.feature_metadata.primary_color 기준이다(107).';

GRANT EXECUTE ON FUNCTION public.admin_crawl_platform_stats() TO app_user;

COMMIT;

-- 적용 확인:
--   SELECT to_regclass('public.idx_products_color'); -- NULL
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'color'; -- 0 rows
