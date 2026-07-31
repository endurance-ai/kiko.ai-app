-- 098_drop_duplicate_product_url_unique.sql
-- products.product_url 에 동일한 UNIQUE 제약이 2개 걸려 있던 것을 1개로 정리한다.
--
-- 실측 2026-07-31:
--   products_product_url_key   UNIQUE (product_url)   index 29 MB
--   uq_products_product_url    UNIQUE (product_url)   index 29 MB
--
-- 완전히 같은 컬럼에 같은 제약이라 인덱스가 이중으로 유지되고 있었다:
--   · 저장공간 29 MB 낭비
--   · product_url 을 쓰는 모든 INSERT/UPDATE 가 인덱스 2개를 갱신 —
--     갱신 배치가 한 바퀴에 15만 행을 건드리므로 그대로 쓰기 비용 2배다
--
-- 어느 쪽을 남기나:
--   uq_products_product_url 을 남긴다. migration 008 이 "중복 크롤링 방지" 목적으로
--   명시적으로 만든 것이고 이름도 프로젝트 컨벤션(uq_ 접두사)을 따른다.
--   products_product_url_key 는 어느 마이그레이션에도 정의가 없다 — 004 의 CREATE
--   TABLE 에 UNIQUE 인라인이 없으므로, 070(id uuid→bigserial 테이블 재구축) 과정에서
--   Postgres 가 자동 명명한 잔재로 보인다.
--
-- 안전성:
--   · products 를 참조하는 FK 4개(product_embeddings / product_reviews /
--     product_features / product_refresh_candidates)는 전부 products.id 를 본다.
--     product_url 유니크 인덱스에 의존하는 FK 는 없다.
--   · PostgREST 의 upsert(onConflict=product_url) 는 제약 **이름**이 아니라 컬럼으로
--     동작하며, 남는 uq_products_product_url 인덱스가 그대로 충돌 대상이 된다.
--     크롤러의 import-products / refresh-candidates 경로가 이 upsert 를 쓴다.
--
-- 되돌리기: ALTER TABLE products ADD CONSTRAINT products_product_url_key UNIQUE (product_url);
--           (다시 29 MB 를 쓰게 되므로 되돌릴 이유는 없다)

BEGIN;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_url_key;

COMMIT;

-- 적용 후 확인 — UNIQUE 제약이 정확히 1개여야 한다:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.products'::regclass AND contype = 'u';
