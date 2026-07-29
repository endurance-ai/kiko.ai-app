-- 096_products_gender_constraint_release.sql
-- products.gender 필수 제약 해제 — 크롤러 gender 생성 중단의 선행 조건.
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- 091 이 `chk_products_gender_required` (cardinality(gender) > 0) 를 걸어
-- "gender 없는 상품은 적재하지 않는다" 정책을 DB 레벨에서 강제했다. 당시엔
-- 크롤러(+hybrid LLM)가 gender 를 공급하는 유일한 출처였기 때문이다.
--
-- 그 전제가 바뀌었다. gender 의 최종 출처는 VLM 이 만드는
-- `product_features.feature_metadata->>'gender'` 이고, 목표 흐름은:
--
--     신규 제품 수집(크롤러) → products INSERT (gender 없이)
--                                ↓ 일정 주기
--                            VLM 배치 → product_features.gender
--
-- 이 CHECK 가 살아 있으면 "gender 없이 INSERT" 자체가 DB 에서 거부되므로
-- 크롤러가 gender 생성을 멈출 수 없다. 그래서 제약을 먼저 푼다.
--
-- ── 컬럼은 왜 안 지우나 ─────────────────────────────────────────────────
-- `feature_metadata->>'gender'` 를 가진 행이 아직 1건뿐이다 (131,058 중).
-- search_products_v6 는 VLM → products.gender → fail-open 3단 다리로 읽고
-- 있고, 기존 154k 행의 gender 가 그 2단계를 지탱한다. VLM 커버리지가 올라오면
-- 별도 마이그레이션으로 컬럼 + idx_products_gender 를 DROP 한다.
--
-- 순서 (지키지 않으면 검색에서 신규 상품이 조용히 사라진다):
--   ① search_products_v6 3단 다리 술어 배포   ← 읽기 먼저
--   ② 이 마이그레이션 (CHECK 해제)
--   ③ 크롤러 gender 생성 중단
--   ④ (나중) VLM 커버리지 확보 후 컬럼 DROP + 다리 술어 1단으로 축소

BEGIN;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_gender_required;

COMMENT ON COLUMN products.gender IS
  'gender 태그 배열 (men/women/unisex). DEPRECATED — 출처가 product_features.feature_metadata->>''gender'' (VLM) 로 이관 중. 신규 행은 NULL 일 수 있다. 필수 제약은 096 에서 해제됨.';

COMMIT;

-- 적용 후 확인:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'products'::regclass AND conname = 'chk_products_gender_required';
--   → 0 rows 이면 성공.
