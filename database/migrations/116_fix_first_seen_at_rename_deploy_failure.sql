-- 116_fix_first_seen_at_rename_deploy_failure.sql
-- 115 마이그레이션 배포 실패 복구.
--
-- 배경:
--   115 배포 시 마지막 `COMMENT ON FUNCTION search_products_v6 IS ...` 에서
--   `ERROR: function name "search_products_v6" is not unique` 발생 — public
--   스키마에 이름이 같은 search_products_v6 오버로드가 이미 2개 이상 존재해
--   인자 없는 COMMENT ON FUNCTION 이 어느 쪽을 가리키는지 모호했다.
--   배포 스크립트는 파일 전체를 단일 psql 세션(`psql ... < file`)에
--   ON_ERROR_STOP=1 로 흘려보내는데, 115 는 BEGIN 으로 시작해 이 에러가 난
--   시점까지 COMMIT 에 도달하지 못한 채 세션이 종료됐다 — PostgreSQL은
--   커밋 안 된 트랜잭션을 연결 종료 시 자동 ROLLBACK 하므로, ALTER TABLE
--   RENAME COLUMN 을 포함한 115 전체가 롤백됐을 가능성이 높다(products.
--   created_at 이 여전히 남아있을 수 있음). 이 마이그는 115 가 롤백된
--   경우와 부분 적용된 경우 둘 다에서 안전하게 최종 상태로 수렴하도록
--   전부 조건부/멱등으로 작성한다.
--
-- 이 마이그가 하는 일:
--   1) products.created_at 이 아직 남아있고 first_seen_at 이 없으면 rename.
--      (115 가 이미 성공했다면 이 블록은 조용히 스킵)
--   2) products.first_seen_at 컬럼 코멘트 재적용 (idempotent).
--   3) public.search_products_v6 이름의 모든 오버로드를 먼저 DROP —
--      원인이 무엇이었든(레거시 오버로드 잔존 등) 사후에 정확히 1개만
--      남도록 강제해 재발을 막는다.
--   4) 082 최신 로직 + first_seen_at 컬럼명으로 함수 재생성.
--   5) COMMENT ON FUNCTION 은 이번엔 전체 인자 시그니처를 명시해 모호성
--      자체를 원천 차단한다.
--
-- Author: kiko.ai 115 배포 실패 hotfix (2026-08-23)

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'first_seen_at'
  ) THEN
    ALTER TABLE products RENAME COLUMN created_at TO first_seen_at;
  END IF;
END $$;

COMMENT ON COLUMN products.first_seen_at IS
  '최초 수집(적재) 시각 — 상품 출시일이 아니라 우리 DB 적재 시각. 크롤은 브랜드 '
  '단위로 통째 돌기 때문에 같은 브랜드 상품들은 같은 초에 몰릴 수 있음 (구 컬럼명 created_at).';

-- ── search_products_v6 오버로드 전부 제거 후 재생성 ────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'search_products_v6' AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

CREATE FUNCTION search_products_v6(
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
  IF p_category IS NOT NULL THEN
    SELECT cc.family INTO v_target_family
    FROM category_canonical cc
    WHERE lower(trim(cc.raw_category)) = lower(trim(p_category))
    LIMIT 1;
    IF v_target_family IS NULL THEN
      v_target_family := 'other';
    END IF;
  END IF;

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

COMMENT ON FUNCTION search_products_v6(halfvec, bigint, text, text, text[], int) IS
  'v6 embedding-first retrieval (SPEC-SEARCH-V6-001 §4/§13 + 073 family '
  'gate + 082 verbatim JOIN fix + 116 first_seen_at rename hotfix). FILTER1 '
  'EXACT primary_style_node → FILTER2 canonical FAMILY (category_canonical, '
  'verbatim raw_category JOIN) + in_stock + embedding → cosine `<=>` ASC, '
  'first_seen_at DESC tie. Ladder F: rung1 node+family (degraded=false) → '
  'rung2 node dropped/family kept (degraded=true) → rung3 cosine-only.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── 권장 검증 (수동, commit 후) ─────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='products' AND column_name IN ('created_at','first_seen_at');
--     -- first_seen_at 만 나와야 함
--   SELECT count(*) FROM pg_proc WHERE proname='search_products_v6';  -- 1 이어야 함
--   SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS distinct_ids
--   FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, 'JERSEY', NULL, NULL, 30);  -- total = distinct_ids
