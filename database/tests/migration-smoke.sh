#!/usr/bin/env bash
set -euo pipefail

psql_checked() { psql -X -v ON_ERROR_STOP=1 "$@"; }

if [[ -f database/migrations/109_product_refresh_platform_types.sql ]]; then
  psql_checked <<'SQL'
CREATE TABLE public.product_refresh_sources (
  platform_key text PRIMARY KEY,
  platform_type text NOT NULL CHECK (platform_type IN (
    'cafe24', 'shopify', 'imweb', 'uniqlo', 'zara', '29cm', 'farfetch'
  ))
);
INSERT INTO public.product_refresh_sources VALUES ('legacy', '29cm');
SQL
  psql_checked -f database/migrations/109_product_refresh_platform_types.sql
  psql_checked -f database/migrations/109_product_refresh_platform_types.sql
  psql_checked <<'SQL'
INSERT INTO public.product_refresh_sources VALUES
  ('new-sixshop', 'sixshop'), ('new-structured', 'structured');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product_refresh_sources) <> 3 THEN
    RAISE EXCEPTION 'Existing or new platform type was lost';
  END IF;
  BEGIN
    INSERT INTO public.product_refresh_sources VALUES ('invalid', 'unknown');
    RAISE EXCEPTION 'Unknown platform type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SQL
fi

if [[ -f database/migrations/093_products_gender_source.sql ]]; then
  psql_checked <<'SQL'
CREATE TABLE public.products (id bigserial PRIMARY KEY);
INSERT INTO public.products DEFAULT VALUES;
SQL
  psql_checked -f database/migrations/093_products_gender_source.sql
  psql_checked -f database/migrations/093_products_gender_source.sql
  psql_checked <<'SQL'
INSERT INTO public.products (gender_source)
SELECT unnest(ARRAY[
  'engine', 'url', 'text', 'config_default', 'brand_scope', 'llm',
  'legacy_backfill', 'repair_url', 'repair_text', 'repair_brand_scope',
  'unverified_legacy'
]);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.products WHERE gender_source IS NULL) <> 1
    OR (SELECT count(*) FROM public.products WHERE gender_source IS NOT NULL) <> 11 THEN
    RAISE EXCEPTION 'Legacy NULL or supported gender source was lost';
  END IF;
  BEGIN
    INSERT INTO public.products (gender_source) VALUES ('unknown');
    RAISE EXCEPTION 'Unknown gender source was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SQL
fi
