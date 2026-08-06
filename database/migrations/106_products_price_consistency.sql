-- 가격 tuple은 crawler/import/refresh 어느 경로에서 오더라도 같은 의미여야 한다.
-- sale_price가 있으면 products.price는 현재 실구매가(=sale_price),
-- original_price는 더 큰 정가다.

CREATE TABLE IF NOT EXISTS public.product_price_consistency_audit (
  product_id bigint PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  platform text NOT NULL,
  product_url text NOT NULL,
  price integer,
  original_price integer,
  sale_price integer,
  reason text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.product_price_consistency_audit (
  product_id,
  platform,
  product_url,
  price,
  original_price,
  sale_price,
  reason
)
SELECT
  id,
  platform,
  product_url,
  price,
  original_price,
  sale_price,
  'invalid_sale_tuple'
FROM public.products
WHERE sale_price IS NOT NULL
  AND (
    original_price IS NULL
    OR sale_price <= 0
    OR sale_price >= original_price
    OR price IS DISTINCT FROM sale_price
  )
ON CONFLICT (product_id) DO NOTHING;

-- 모순된 sale 표지만 제거한다. 현재가/정가는 어느 쪽이 진짜인지 추측하지 않고
-- 그대로 보존하며, 활성 소스 backfill이 공식 가격으로 다시 채운다.
UPDATE public.products
SET sale_price = NULL,
    updated_at = now()
WHERE sale_price IS NOT NULL
  AND (
    original_price IS NULL
    OR sale_price <= 0
    OR sale_price >= original_price
    OR price IS DISTINCT FROM sale_price
  );

ALTER TABLE public.products
  ADD CONSTRAINT chk_products_sale_price_consistency
  CHECK (
    sale_price IS NULL
    OR (
      sale_price > 0
      AND original_price IS NOT NULL
      AND sale_price < original_price
      AND price = sale_price
    )
  ) NOT VALID;

ALTER TABLE public.products
  VALIDATE CONSTRAINT chk_products_sale_price_consistency;

COMMENT ON CONSTRAINT chk_products_sale_price_consistency ON public.products IS
  'sale_price가 있으면 price는 같은 현재가이고 original_price는 더 큰 정가';
