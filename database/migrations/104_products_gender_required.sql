-- 104_products_gender_required.sql
--
-- `chk_products_gender_required` 재도입 + **VALIDATE**.
-- 096_products_gender_constraint_release.sql 이 DROP 한 것을 되돌린다.
--
-- 배경: gender 출처를 VLM(product_features) 으로 이관했다가 성능 미달로
-- 2026-08-03 크롤러로 회귀했다. 크롤러가 다시 products.gender 의 단일 출처이며,
-- 성별을 확정하지 못한 상품은 적재하지 않는다. 그 계약을 DB 가 강제한다.
-- color 는 계속 VLM 소관이다 (099_products_color_nullable.sql 유지).
--
-- ── 선행 조건 (반드시 확인) ───────────────────────────────────────────────
--
--   1. 103_products_gender_cleanup.sql 적용 완료
--   2. 감사 쿼리가 dirty=0 AND still_null=0
--   3. **크롤러 코드가 배포되어 있을 것.** 두 INSERT 경로
--      (crawler/src/import-products.ts, crawler/src/refresh-candidates.ts)가
--      gender 를 실어 보내야 한다.
--
--      3번이 이 파일에서 가장 위험한 항목이다. 연구실 서버(gpusystem,
--      /home/kjk/kiko-crawler)의 kiko-refresh.timer 가 OnUnitInactiveSec=15min
--      으로 돌며 kiko-refresh-candidates.service 를 연쇄시킨다. 옛 코드가 도는
--      상태에서 이 CHECK 이 걸리면 15분마다 신규상품 INSERT 가 전량 실패한다 —
--      099_products_color_nullable.sql 이 기록한 사고(210회 연속
--      `null value in column "color"`)가 gender 로 재현된다.
--      가격·재고 UPDATE 는 계속 성공하므로 대시보드는 초록색인 채 신규 유입만
--      0 이 된다. 조용히 실패한다는 뜻이다.
--
-- ── 091 과 다른 점 ────────────────────────────────────────────────────────
--
-- 091_products_gender_required.sql 은 CHECK 을 NOT VALID 로만 걸고 끝냈다.
-- 그래서 기존 행이 검사되지 않았고 `{kids}` 351 / `{unknown}` 301 / `{baby}` 170
-- 이 그대로 남았다. 이번에는 VALIDATE 까지 반드시 수행한다.
--
-- 091 은 또 brand_nodes.gender_scope 에서 13,942행을 일괄 backfill 했는데,
-- 이번 회귀는 브랜드 스코프를 근거로 쓰지 않는다 — 그 데이터는 감사 도구도
-- 수정 UI 도 없고, 단일값이면서 틀린 행이 상품으로 조용히 전파되는 유일한
-- 경로였다 (crawler/src/lib/product-gender.ts 헤더 참조).

BEGIN;

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_gender_required;

-- NOT VALID 로 먼저 건다: ADD CONSTRAINT 단독은 전체 스캔 동안
-- ACCESS EXCLUSIVE 락을 잡는다(~16만 행). 아래 VALIDATE 는
-- SHARE UPDATE EXCLUSIVE 만 잡으므로 읽기·쓰기를 막지 않는다.
ALTER TABLE products
  ADD CONSTRAINT chk_products_gender_required
  CHECK (
    gender IS NOT NULL
    AND cardinality(gender) > 0
    AND array_position(gender, NULL) IS NULL
    AND gender <@ ARRAY['men', 'women', 'unisex']::text[]
  ) NOT VALID;

COMMENT ON COLUMN products.gender IS
  'gender 태그 배열 (men/women/unisex). 출처는 크롤러 write-path
   (import-products.ts / refresh-candidates.ts). 096 의 DEPRECATED 표기는 철회 —
   VLM(product_features.gender) 성능 미달로 2026-08 크롤러 회귀.
   color 는 계속 product_features.feature_metadata->>''primary_color'' 가 정본이다.';

COMMIT;

-- 락 창을 짧게 유지하기 위해 트랜잭션 밖에서 검증 (093 패턴).
ALTER TABLE products VALIDATE CONSTRAINT chk_products_gender_required;

-- ── 적용 후 확인 (091 이 건너뛴 단계) ─────────────────────────────────────
--
-- SELECT conname, convalidated
-- FROM pg_constraint
-- WHERE conrelid = 'products'::regclass
--   AND conname = 'chk_products_gender_required';
--
-- convalidated 가 't' 여야 한다. 'f' 면 기존 행이 검사되지 않은 것이고,
-- 091 과 같은 상태 — dirty 값이 다시 쌓인다.
--
-- ── 다음 단계 ─────────────────────────────────────────────────────────────
--
-- VALIDATE 성공 후, 읽기 경로의 성별 3단 다리를 한 단으로 축약한다:
--   ai-server/sql/functions/search_products_v6.sql        (술어 5곳)
--   ai-server/sql/functions/search_products_hybrid_v1.sql (kNN CTE 2곳)
--   ai-server/app/services/curation_refresh.py            GENDER_MATCH_SQL
--   ai-server/app/api/products.py                         PDP 상세 쿼리
--
--   AND (p_gender IS NULL OR p.gender && ARRAY[p_gender, 'unisex'])
--
-- 이 CHECK 이 p.gender 의 non-NULL·non-empty 를 보장하므로 `&&` 가 NULL 을
-- 낼 수 없고, fail-open 단이 필요 없어진다.
-- `LEFT JOIN product_features pf` 는 **유지한다** — primary_color 필터가 쓴다.
