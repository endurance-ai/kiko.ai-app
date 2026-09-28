-- 상품 성별의 근거를 보존한다. 108 및 119 마이그레이션은 이 컬럼을 사용한다.
-- 같은 번호의 이미지 선택 마이그레이션과 파일명이 달라 함께 실행된다.

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gender_source text;

DO $gender_source_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_gender_source_chk'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_gender_source_chk
      CHECK (gender_source IS NULL OR gender_source IN (
        'engine',
        'url',
        'text',
        'config_default',
        'brand_scope',
        'llm',
        'legacy_backfill',
        'repair_url',
        'repair_text',
        'repair_brand_scope',
        'unverified_legacy'
      )) NOT VALID;
  END IF;
END
$gender_source_constraint$;

COMMENT ON COLUMN public.products.gender_source IS
  'products.gender의 근거. NULL은 마이그레이션 이전 행 또는 출처 미확인 행이다.';

COMMIT;

-- 기존 행 검사는 쓰기 트랜잭션 밖에서 수행한다.
DO $gender_source_validation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_gender_source_chk'
      AND NOT convalidated
  ) THEN
    ALTER TABLE public.products VALIDATE CONSTRAINT products_gender_source_chk;
  END IF;
END
$gender_source_validation$;
