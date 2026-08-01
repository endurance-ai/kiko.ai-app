-- 099_products_color_nullable.sql
-- products.color 의 NOT NULL 을 해제한다. 096(gender CHECK 해제)의 color 판이다.
--
-- 왜 지금 필요한가 — 상품 적재가 완전히 멈춰 있다 (실측 2026-08-01):
--   products 마지막 INSERT: 2026-07-29 (967행). 07-30 이후 0행.
--   신규상품 워커 실패 210건, 전부 동일 메시지:
--     null value in column "color" of relation "products" violates not-null constraint
--
--   2026-07-29 VLM 이관(crawler CLAUDE.md §18)으로 크롤러가 color 를 더 이상
--   만들지 않는다. 그런데 컬럼은 NOT NULL 이고 DEFAULT 도 없다 — 즉 신규상품
--   워커와 온보딩 import 가 **구조적으로** INSERT 할 수 없는 상태였다.
--   갱신(UPDATE) 경로는 color 를 건드리지 않아 영향이 없었고, 그래서 이 고장이
--   가격·재고 갱신 지표에는 안 보였다.
--
-- 왜 DROP COLUMN 이 아닌가:
--   기존 154,403행의 값은 남겨 둔다. `src/analyze-products.ts` 가 VLM 호출 시
--   color 를 힌트로 넘긴다(`color: product.color || undefined` — null 안전).
--   힌트를 잃을 이유가 없고, 값은 어차피 새로 안 생기므로 자연 소멸한다.
--
--   덧붙여 남아 있는 값의 품질이 이관 사유를 그대로 보여준다 — 07-2x 적재분의
--   실제 color 값에 `수량`, `10h`, `사용 흔적시 교환, 반품 불가 동의 동의` 가
--   섞여 있다. 색의 단일 출처는 product_features.feature_metadata->>'primary_color'.
--
-- 색상 소비처 확인:
--   · search_products_v6 / v6-debug: 이미 product_features 를 읽는다 (095)
--   · admin PDP: products.color 미참조
--   → NOT NULL 해제로 깨지는 읽기 경로 없음.
--
-- 되돌리기 (신규 행이 생기기 전에만 가능):
--   ALTER TABLE products ALTER COLUMN color SET NOT NULL;

BEGIN;

ALTER TABLE public.products
  ALTER COLUMN color DROP NOT NULL;

COMMIT;

-- 적용 후 확인 — is_nullable 이 YES 여야 한다:
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='products' AND column_name='color';
