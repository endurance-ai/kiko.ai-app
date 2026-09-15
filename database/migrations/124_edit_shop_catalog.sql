-- 124_edit_shop_catalog.sql
-- Consumer-facing edit-shop profiles and crawler-owned listing snapshots.
-- `products.platform` remains the catalog provenance key; this profile table
-- only marks the small subset exposed as edit-shop destinations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.edit_shop_profiles (
  platform      text PRIMARY KEY,
  display_name  text NOT NULL,
  description   text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edit_shop_profiles_platform_chk
    CHECK (platform ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT edit_shop_profiles_display_name_chk
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT edit_shop_profiles_description_chk
    CHECK (btrim(description) <> '')
);

INSERT INTO public.edit_shop_profiles (platform, display_name, description)
VALUES
  ('slowsteadyclub', 'SLOW STEADY CLUB', 'SLOW STEADY CLUB에서 판매 중인 상품을 모아봤어요.'),
  ('8division', '8DIVISION', '8DIVISION에서 판매 중인 상품을 모아봤어요.'),
  ('etcseoul', 'ETC Seoul', 'ETC Seoul에서 판매 중인 상품을 모아봤어요.'),
  ('fr8ight', 'FR8IGHT', 'FR8IGHT에서 판매 중인 상품을 모아봤어요.'),
  ('kith', 'KITH', 'KITH에서 판매 중인 상품을 모아봤어요.')
ON CONFLICT (platform) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.edit_shop_listing_snapshots (
  id            bigserial PRIMARY KEY,
  platform      text NOT NULL REFERENCES public.edit_shop_profiles(platform),
  list_type     text NOT NULL CHECK (list_type IN ('what100', 'category')),
  list_key      text NOT NULL,
  display_name  text NOT NULL,
  item_count    integer NOT NULL CHECK (item_count > 0),
  captured_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edit_shop_listing_snapshots_key_chk CHECK (btrim(list_key) <> ''),
  CONSTRAINT edit_shop_listing_snapshots_name_chk CHECK (btrim(display_name) <> ''),
  UNIQUE (platform, list_type, list_key, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_edit_shop_listing_snapshots_latest
  ON public.edit_shop_listing_snapshots (platform, list_type, list_key, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.edit_shop_listing_items (
  snapshot_id  bigint NOT NULL REFERENCES public.edit_shop_listing_snapshots(id) ON DELETE CASCADE,
  product_no   bigint NOT NULL CHECK (product_no > 0),
  source_rank  integer NOT NULL CHECK (source_rank > 0),
  PRIMARY KEY (snapshot_id, product_no),
  UNIQUE (snapshot_id, source_rank)
);

CREATE INDEX IF NOT EXISTS idx_edit_shop_listing_items_product
  ON public.edit_shop_listing_items (product_no, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_products_platform_product_no
  ON public.products (platform, product_no)
  WHERE product_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.replace_edit_shop_listing_snapshot(
  p_platform text,
  p_list_type text,
  p_list_key text,
  p_display_name text,
  p_captured_at timestamptz,
  p_items jsonb
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot_id bigint;
  v_count integer;
  v_unique_products integer;
  v_unique_ranks integer;
  v_min_rank integer;
  v_max_rank integer;
BEGIN
  IF p_list_type NOT IN ('what100', 'category') THEN
    RAISE EXCEPTION 'invalid edit-shop list_type: %', p_list_type;
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'edit-shop snapshot items must be an array';
  END IF;

  SELECT count(*), count(DISTINCT product_no), count(DISTINCT source_rank),
         min(source_rank), max(source_rank)
  INTO v_count, v_unique_products, v_unique_ranks, v_min_rank, v_max_rank
  FROM jsonb_to_recordset(p_items) AS x(product_no bigint, source_rank integer);

  IF v_count = 0 OR v_count <> v_unique_products OR v_count <> v_unique_ranks
     OR v_min_rank < 1 THEN
    RAISE EXCEPTION 'edit-shop snapshot must contain unique products and positive unique ranks';
  END IF;
  IF p_list_type = 'what100'
     AND (v_count <> 100 OR v_min_rank <> 1 OR v_max_rank <> 100) THEN
    RAISE EXCEPTION 'what100 snapshot must contain exactly 100 items ranked 1..100 (got %)', v_count;
  END IF;

  INSERT INTO public.edit_shop_listing_snapshots
      (platform, list_type, list_key, display_name, item_count, captured_at)
  VALUES
      (p_platform, p_list_type, p_list_key, p_display_name, v_count, p_captured_at)
  ON CONFLICT (platform, list_type, list_key, captured_at) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      item_count = EXCLUDED.item_count
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.edit_shop_listing_items WHERE snapshot_id = v_snapshot_id;
  INSERT INTO public.edit_shop_listing_items (snapshot_id, product_no, source_rank)
  SELECT v_snapshot_id, product_no, source_rank
  FROM jsonb_to_recordset(p_items) AS x(product_no bigint, source_rank integer)
  ORDER BY source_rank;

  RETURN v_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_edit_shop_listing_snapshot(
  text, text, text, text, timestamptz, jsonb
) TO app_user;

COMMENT ON TABLE public.edit_shop_profiles IS
  'Consumer-facing profile overlay for selected products.platform values; not a brand or catalog owner.';
COMMENT ON TABLE public.edit_shop_listing_snapshots IS
  'Only complete crawler snapshots of edit-shop rankings and source categories.';
COMMENT ON TABLE public.edit_shop_listing_items IS
  'Ordered product_no membership for one complete source listing snapshot.';
COMMENT ON FUNCTION public.replace_edit_shop_listing_snapshot IS
  'Atomically validates and publishes one complete edit-shop source listing snapshot.';

COMMIT;

