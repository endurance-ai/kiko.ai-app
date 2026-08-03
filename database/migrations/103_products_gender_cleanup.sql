-- 103_products_gender_cleanup.sql
--
-- products.gender 값 정리 — 104 의 CHECK VALIDATE 를 위한 선행 단계.
--
-- 배경: 2026-07-29 에 gender 출처를 크롤러 → product_features(VLM) 로 이관했으나
-- (096_products_gender_constraint_release.sql) VLM 성능이 기준에 못 미쳐
-- 2026-08-03 크롤러로 회귀했다. color 는 VLM 에 그대로 둔다.
--
-- 이 마이그레이션이 정리하는 두 부류:
--
--   (a) canonical 밖 토큰. 091_products_gender_required.sql 의 CHECK 이
--       NOT VALID 였던 탓에 `{kids}` `{unknown}` `{baby}` 같은 값이 들어왔다.
--       배열에서 men/women/unisex 만 남기고, 남는 게 없으면 NULL 로 만든다.
--
--   (b) 빈 배열 / NULL 원소를 가진 배열. cardinality=0 은 "성별 있음"이 아니다.
--
-- (a)+(b) 이후 products.gender 의 상태는 정확히 둘뿐이다:
--   · men/women/unisex 로만 이뤄진 비어있지 않은 배열
--   · NULL  ← 크롤러 재크롤 또는 src/repair-product-gender.ts 가 채운다
--
-- 멱등하다. 여러 번 돌려도 결과가 같다.
--
-- 순서: 이 파일 → (재크롤 + repair 스크립트로 NULL 해소) → 104.
--       104 는 NULL 이 0 이 되기 전에는 VALIDATE 에 실패한다.

BEGIN;

-- (a) canonical 밖 토큰 제거
UPDATE products
SET gender = NULLIF(
      ARRAY(
        SELECT DISTINCT g
        FROM unnest(gender) AS g
        WHERE g IN ('men', 'women', 'unisex')
      ),
      '{}'
    )
WHERE gender IS NOT NULL
  AND NOT (gender <@ ARRAY['men', 'women', 'unisex']::text[]);

-- (b) 빈 배열 / NULL 원소 → NULL
UPDATE products
SET gender = NULL
WHERE gender IS NOT NULL
  AND (cardinality(gender) = 0 OR array_position(gender, NULL) IS NOT NULL);

COMMIT;

-- ── 감사 (104 진행 전 확인) ───────────────────────────────────────────────
-- dirty 는 0 이어야 한다. still_null 이 0 이 될 때까지 104 를 적용하지 말 것.
--
-- SELECT
--   count(*) FILTER (
--     WHERE gender IS NOT NULL
--       AND NOT (gender <@ ARRAY['men','women','unisex']::text[])
--   ) AS dirty,
--   count(*) FILTER (WHERE gender IS NULL) AS still_null,
--   count(*) AS total
-- FROM products;
--
-- 플랫폼별 잔여 NULL (재크롤 대상 선정용):
--
-- SELECT platform, count(*) AS null_rows
-- FROM products
-- WHERE gender IS NULL
-- GROUP BY platform
-- ORDER BY null_rows DESC;
