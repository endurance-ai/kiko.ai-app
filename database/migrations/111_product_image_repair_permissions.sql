-- Allow the embedding app role to use the narrowly-scoped image repair RPC
-- without granting broad UPDATE/DELETE privileges on products and derived
-- asset tables.

BEGIN;

ALTER FUNCTION public.repair_product_image_assets(jsonb) SECURITY DEFINER;
ALTER FUNCTION public.invalidate_product_image_assets_on_change() SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.repair_product_image_assets(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invalidate_product_image_assets_on_change() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.repair_product_image_assets(jsonb) TO app_user;

COMMENT ON FUNCTION public.repair_product_image_assets(jsonb) IS
  'SECURITY DEFINER: app_user-only optimistic image repair; removes confirmed-bad URLs, promotes image_url, and invalidates derived assets without broad products UPDATE grants.';
COMMENT ON FUNCTION public.invalidate_product_image_assets_on_change() IS
  'SECURITY DEFINER trigger: invalidates embeddings, VLM features, and stale failure state whenever canonical products.image_url changes.';

COMMIT;
