-- 097_product_features_coverage.sql
-- VLM product_features 커버리지 가시화 + 미처리 작업 큐 (뷰 2개, 추가 전용).
--
-- 배경
--   product_features 131,058행은 2026-07-28 20:41 **단일 벌크**로 생성됐고
--   증분 경로가 없다. 그런데 gender/color 의 단일 출처가 이미 여기로 넘어왔다:
--     · search_products_v6  — 색상은 primary_color 만 본다 (완화 없는 정밀 필터)
--     · curation / PDP      — gender 3단 다리의 1번째 칸
--   따라서 features 가 없는 상품은 **색상 검색에서 통째로 빠진다.**
--   실측 2026-07-29: in_stock 88,411 중 9,128 미보유 (대부분 7/27 온보딩 코호트).
--
--   product_embedding_coverage(플랫폼별 집계 리포트)와 같은 패턴이되, 배치가
--   실제로 소비할 대기열(product_features_pending)을 하나 더 둔다.
--
-- 소비 계약 (VLM 배치)
--   1. product_features_pending 에서 원하는 만큼 읽는다. 권장 정렬은
--      crawled_at DESC (최근 온보딩 브랜드가 커버리지 구멍의 대부분이다).
--   2. product_features 에 INSERT ... ON CONFLICT (product_id) DO UPDATE.
--      → 재실행이 안전하므로 클레임/락 테이블을 두지 않았다. 배치를 여러
--        프로세스로 쪼갤 계획이 생기면 그때 claim 컬럼을 논의한다.
--   3. 진행률은 product_features_coverage 로 확인한다.

BEGIN;

-- 플랫폼별 커버리지 리포트. product_embedding_coverage 와 열 구성을 맞췄다.
CREATE OR REPLACE VIEW public.product_features_coverage AS
SELECT
    p.platform,
    count(*)                    AS total,
    count(pf.product_id)        AS featured,
    round(
        100.0 * count(pf.product_id)::numeric / NULLIF(count(*), 0)::numeric,
        2
    )                           AS pct_featured,
    count(*) FILTER (
        WHERE pf.feature_metadata ? 'gender'
    )                           AS with_gender,
    max(pf.generated_at)        AS last_generated_at
FROM public.products p
LEFT JOIN public.product_features pf ON pf.product_id = p.id
WHERE p.in_stock
GROUP BY p.platform
ORDER BY count(*) DESC;

COMMENT ON VIEW public.product_features_coverage IS
    'in_stock 상품의 플랫폼별 VLM 피처 커버리지. with_gender 는 Track B '
    '(products.gender DROP) 착수 가능 여부를 보는 지표다.';

-- 배치가 소비할 대기열. 이미지가 없으면 VLM 이 할 일이 없으므로 제외한다.
CREATE OR REPLACE VIEW public.product_features_pending AS
SELECT
    p.id            AS product_id,
    p.image_url,
    p.images,
    p.brand,
    p.name,
    p.category,
    p.subcategory,
    p.platform,
    p.crawled_at
FROM public.products p
LEFT JOIN public.product_features pf ON pf.product_id = p.id
WHERE p.in_stock
  AND pf.product_id IS NULL
  AND p.image_url IS NOT NULL
  AND btrim(p.image_url) <> '';

COMMENT ON VIEW public.product_features_pending IS
    'VLM 피처 미보유 in_stock 상품. 배치는 여기서 읽고 product_features 에 '
    'upsert 한다 — 재실행 안전하므로 클레임 컬럼 없음. 권장 정렬 crawled_at DESC.';

COMMIT;
