-- 105_products_gender_single_value.sql
--
-- `chk_products_gender_required` 를 **단일값** 계약으로 좁힌다.
-- 104 는 `cardinality(gender) > 0` 이었다 — 다중값을 허용했다.
--
-- 배경: products.gender 는 men/women/unisex 중 하나여야 한다. 검색 RPC 가
-- `p.gender && ARRAY[p_gender,'unisex']` 로 매칭하므로 `['men','women']` 은
-- unisex 와 **똑같이** 남녀 양쪽 결과에 노출된다. 그런데 그 값의 의미는
-- "남녀공용 확인됨"이 아니라 "판정 실패"다. 두 상태가 검색에서 구별되지 않는
-- 것이 문제다 — 이 프로젝트가 막으려는 세탁과 정확히 같은 결과를 낸다.
--
-- 실측 (2026-08-05, 전체 158,560행):
--   · 다중값 16,468행 (browns 8,757 / slam-jam 1,561 / union-la 1,085 …)
--   · 그중 15,137행이 gender_source NULL — 093 이전 적재분이라 감사 불가
--   · gender_source='engine' 553행은 전부 2026-06/07 생성. 구 shopify 태그
--     union(`"womens".includes("men")`) 잔재이고 **신규 발생분은 없다**
--   · 08-03 크롤러 회귀 이후 신규 1,477행에는 다중값이 0건이다
--
-- ai-server 가 `3ea5a29 refactor(search): collapse the gender bridge to
-- products.gender` 로 읽기 경로의 fail-open 3단 다리를 1단으로 줄였기 때문에,
-- 이제 이 컬럼의 오염이 검색 결과로 직결된다. 예전에는 VLM 단이 일부를 가렸다.
--
-- ── 선행 조건 (반드시 확인) ───────────────────────────────────────────────
--
--   1. 104_products_gender_required.sql 적용 완료 + convalidated = 't'
--
--   2. **크롤러 코드가 배포되어 있을 것.** 이 파일에서 가장 위험한 항목이다.
--      다중값을 거부하는 가드가 세 곳에 들어갔다:
--        · crawler/src/lib/product-gender.ts  resolveProductGenderWithSource
--        · crawler/src/import-products.ts      (배치 INSERT)
--        · crawler/src/lib/refresh-candidate-import.ts (연구실 서버 워커)
--
--      옛 코드가 도는 상태에서 이 CHECK 을 걸면 신규상품 INSERT 가 전량
--      실패한다 — 099_products_color_nullable.sql 이 기록한 사고(210회 연속
--      `null value in column "color"`)의 재현이다. 가격·재고 UPDATE 는 계속
--      성공하므로 대시보드는 초록색인 채 신규 유입만 0 이 된다. 조용히
--      실패한다는 뜻이다. 104 헤더가 같은 경고를 남겼다.
--
--   3. 다중값 잔여 0 확인. 아래 감사 쿼리가 0 이어야 VALIDATE 가 통과한다:
--
--        SELECT count(*) FROM products WHERE cardinality(gender) <> 1;
--
--      정리 절차:
--        pnpm repair:product-gender --scope=multi-gender --plan=... → 검토 → --apply
--          (실측 16,468행 중 12,672행이 DB 텍스트 재판정만으로 단일값 확정)
--        잔여 3,796행은 재크롤 후 재임포트, 그래도 미확인이면 삭제 런북
--          (crawler/sql/runbooks/2026-08-05-delete-gender-multi-value.sql)
--
-- ── 104 와 다른 점 ────────────────────────────────────────────────────────
--
-- `cardinality(gender) = 1` 이므로 104 의 `array_position(gender, NULL) IS NULL`
-- 은 필요 없다 — 원소가 하나뿐이고 그 하나가 `<@` 로 canonical 임이 강제되면
-- NULL 원소는 성립하지 않는다.

BEGIN;

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_gender_required;

-- NOT VALID 로 먼저 건다: ADD CONSTRAINT 단독은 전체 스캔 동안
-- ACCESS EXCLUSIVE 락을 잡는다(~16만 행). 아래 VALIDATE 는
-- SHARE UPDATE EXCLUSIVE 만 잡으므로 읽기·쓰기를 막지 않는다 (93/104 패턴).
ALTER TABLE products
  ADD CONSTRAINT chk_products_gender_required
  CHECK (
    gender IS NOT NULL
    AND cardinality(gender) = 1
    AND gender <@ ARRAY['men', 'women', 'unisex']::text[]
  ) NOT VALID;

COMMENT ON COLUMN products.gender IS
  'gender 태그 (men/women/unisex 중 **하나**). 출처는 크롤러 write-path
   (import-products.ts / refresh-candidates.ts). 다중값은 105 에서 금지 —
   `p.gender && ARRAY[p_gender,''unisex'']` 가 다중값을 unisex 와 구별하지
   못해 판정 실패가 남녀 양쪽 노출로 새기 때문이다.
   color 는 계속 product_features.feature_metadata->>''primary_color'' 가 정본이다.';

COMMIT;

-- 락 창을 짧게 유지하기 위해 트랜잭션 밖에서 검증 (093/104 패턴).
ALTER TABLE products VALIDATE CONSTRAINT chk_products_gender_required;

-- ── 적용 후 확인 ──────────────────────────────────────────────────────────
--
-- SELECT conname, convalidated
-- FROM pg_constraint
-- WHERE conrelid = 'products'::regclass
--   AND conname = 'chk_products_gender_required';
--
-- convalidated 가 't' 여야 한다. 'f' 면 기존 행이 검사되지 않은 것이고,
-- 091 과 같은 상태 — 다중값이 다시 쌓인다.
--
-- ⚠️ 적용 후 24시간 내에 신규 유입이 살아있는지 반드시 확인한다. 선행조건 2가
--    깨졌을 때의 증상이 "에러 없음 + 신규 0" 이라 대시보드로는 안 보인다:
--
--      SELECT count(*) FROM products WHERE created_at >= '<배포 시각>';
