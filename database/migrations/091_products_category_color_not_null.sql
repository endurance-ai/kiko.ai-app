-- 091_products_category_color_not_null.sql
-- products.category + products.color NOT NULL 강제
--
-- 배경:
--   migration 005 (category), 011 (color) 에서 nullable 로 추가됨.
--   크롤러가 최대한 추출을 시도하나 color null 비율이 ~70% 유지.
--   근본 원인:
--     - category: 분류 미일치 시 "" → import-products 에서 || null 변환 → DB NULL
--     - color: 옵션 미감지 시 null → DB NULL
--
-- 선행 조건 (본 마이그 실행 전 완료 필요):
--   1. crawler PR — validator: category/color z.string().min(1) 로 강화
--                   import-products: || null 변환 제거
--   2. 전체 재크롤 완료 (npm run crawl -- --all && npm run import:products)
--      → upsert 로 기존 행의 category/color 최대한 채움
--
-- 처리:
--   1. 재크롤 후에도 category IS NULL OR color IS NULL 인 잔여 행 삭제
--      category/color 추출 불가 상품 = 검색 품질 무가치 → 적재 불필요
--      ON DELETE CASCADE → product_embeddings, product_reviews 함께 정리
--   2. NOT NULL 제약 추가
--
-- Author: Engineering (2026-06-22)

BEGIN;

DELETE FROM products
WHERE category IS NULL
   OR color IS NULL;

ALTER TABLE products
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN color    SET NOT NULL;

COMMIT;
