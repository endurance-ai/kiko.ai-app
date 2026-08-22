-- 115_products_rename_created_at_to_first_seen_at.sql
-- products.created_at 을 products.first_seen_at 으로 rename.
--
-- 배경:
--   products.created_at 은 최초 INSERT 시각으로, 크롤러의 모든 upsert 경로
--   (import-products.ts / refresh-candidate-import.ts / listing-refresh.ts)가
--   이 컬럼을 payload 에 포함하지 않아 재크롤에도 값이 보존된다 — 사실상
--   "최초 수집 시각" 으로 이미 동작하고 있었지만 컬럼명이 그 의도를 드러내지
--   않았다 (ai-server/app/services/notifications.py 에 "created_at 은 출시일이
--   아니라 DB 적재 시각" 이라는 별도 주석이 필요했을 정도). rename 으로 의미를
--   명시한다.
--
-- ALTER TABLE ... RENAME COLUMN 은 메타데이터만 바꾸는 원자적 연산이라 기존
-- 값은 전부 그대로 보존된다 — 백필 불필요, 테이블 재작성 없음.
--
-- 컬럼 rename 은 인덱스 정의에는 자동 추종한다 (058, 101 의
-- products(brand_node_id, created_at DESC, ...) 인덱스는 조치 불필요).
-- 그러나 plpgsql 함수 본문은 텍스트로 저장되어 자동 추종하지 않으므로
-- search_products_v6 (최신 정의: 082_fix_v6_category_join_verbatim.sql) 를
-- CREATE OR REPLACE 로 재정의한다. 시그니처/리턴 컬럼/로직은 082 와 동일하고
-- p.created_at → p.first_seen_at 만 변경.
--
-- Author: kiko.ai products.created_at rename (2026-08-22)

BEGIN;

ALTER TABLE products RENAME COLUMN created_at TO first_seen_at;

COMMENT ON COLUMN products.first_seen_at IS
  '최초 수집(적재) 시각 — 상품 출시일이 아니라 우리 DB 적재 시각. 크롤은 브랜드 '
  '단위로 통째 돌기 때문에 같은 브랜드 상품들은 같은 초에 몰릴 수 있음 (구 컬럼명 created_at).';

CREATE OR REPLACE FUNCTION search_products_v6(
  query_embedding   halfvec(768),
  p_style_node_id   bigint  DEFAULT NULL,
  p_category        text    DEFAULT NULL,
  p_subcategory     text    DEFAULT NULL,
  p_brand_names     text[]  DEFAULT NULL,
  p_limit           int     DEFAULT 30
)
RETURNS TABLE (
  id            bigint,
  brand         text,
  name          text,
  price         integer,
  image_url     text,
  product_url   text,
  platform      text,
  subcategory   text,
  distance      double precision,
  degraded      boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_target_family text := NULL;
  v_node_count    integer := 0;
  v_node_fam_cnt  integer := 0;
BEGIN
  -- ── p_category → family lookup (정규화 유지) ──────────────────────
  IF p_category IS NOT NULL THEN
    SELECT cc.family INTO v_target_family
    FROM category_canonical cc
    WHERE lower(trim(cc.raw_category)) = lower(trim(p_category))
    LIMIT 1;
    IF v_target_family IS NULL THEN
      v_target_family := 'other';
    END IF;
  END IF;

  -- ── rung 1 count: EXACT node + family gate ────────────────────────
  IF p_style_node_id IS NOT NULL THEN
    SELECT count(*) INTO v_node_fam_cnt
    FROM products p
    JOIN brand_nodes bn ON bn.id = p.brand_node_id
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN category_canonical cc
      ON cc.raw_category = p.category
    WHERE bn.primary_style_node_id = p_style_node_id
      AND p.in_stock = true
      AND (
        p_category IS NULL
        OR v_target_family IS NULL
        OR v_target_family = 'other'
        OR COALESCE(cc.family, 'other') = v_target_family
      )
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));
  END IF;

  IF p_style_node_id IS NOT NULL AND v_node_fam_cnt > 0 THEN
    -- ── rung 1: EXACT node + family gate (NOT degraded) ────────────
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             false AS degraded
      FROM products p
      JOIN brand_nodes bn ON bn.id = p.brand_node_id
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN category_canonical cc
        ON cc.raw_category = p.category
      WHERE bn.primary_style_node_id = p_style_node_id
        AND p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.first_seen_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 2: node filter dropped, family gate KEPT (degraded) ─────
  SELECT count(*) INTO v_node_count
  FROM products p
  JOIN product_embeddings pe ON pe.product_id = p.id
  LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
  LEFT JOIN category_canonical cc
    ON cc.raw_category = p.category
  WHERE p.in_stock = true
    AND (
      p_category IS NULL
      OR v_target_family IS NULL
      OR v_target_family = 'other'
      OR COALESCE(cc.family, 'other') = v_target_family
    )
    AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
    AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));

  IF v_node_count > 0 THEN
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             true AS degraded
      FROM products p
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
      LEFT JOIN category_canonical cc
        ON cc.raw_category = p.category
      WHERE p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.first_seen_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 3: node + family BOTH dropped (still degraded) ──────────
  RETURN QUERY
    SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
           p.platform, p.subcategory,
           (pe.embedding <=> query_embedding)::double precision AS distance,
           true AS degraded
    FROM products p
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
    WHERE p.in_stock = true
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
    ORDER BY pe.embedding <=> query_embedding ASC, p.first_seen_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_products_v6 IS
  'v6 embedding-first retrieval (SPEC-SEARCH-V6-001 §4/§13 + 073 family '
  'gate + 082 verbatim JOIN fix + 115 first_seen_at rename). FILTER1 EXACT '
  'primary_style_node → FILTER2 canonical FAMILY (category_canonical, '
  'verbatim raw_category JOIN) + in_stock + embedding → cosine `<=>` ASC, '
  'first_seen_at DESC tie. Ladder F: rung1 node+family (degraded=false) → '
  'rung2 node dropped/family kept (degraded=true) → rung3 cosine-only.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── 권장 검증 (수동, commit 후) ─────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='products' AND column_name IN ('created_at','first_seen_at');
--     -- first_seen_at 만 나와야 함
--   SELECT first_seen_at FROM products ORDER BY id LIMIT 5;  -- 기존 값 보존 확인
--   SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS distinct_ids
--   FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, 'JERSEY', NULL, NULL, 30);  -- total = distinct_ids
