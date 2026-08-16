-- The embedding runner connects as ai_user. Keep product/image tables locked
-- down and expose only the scoped image-health functions it needs.

BEGIN;

ALTER FUNCTION public.record_product_image_failure(
  bigint, text, text, text, integer, timestamptz, text
) SECURITY DEFINER;
ALTER FUNCTION public.clear_product_image_failure(bigint, text) SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.record_product_image_failure(
  bigint, text, text, text, integer, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_product_image_failure(bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.repair_product_image_assets(jsonb) TO ai_user;
GRANT EXECUTE ON FUNCTION public.record_product_image_failure(
  bigint, text, text, text, integer, timestamptz, text
) TO app_user, ai_user;
GRANT EXECUTE ON FUNCTION public.clear_product_image_failure(bigint, text)
  TO app_user, ai_user;

COMMENT ON FUNCTION public.record_product_image_failure(
  bigint, text, text, text, integer, timestamptz, text
) IS
  'SECURITY DEFINER: scoped app_user/ai_user upsert of product image failure and retry state.';
COMMENT ON FUNCTION public.clear_product_image_failure(bigint, text) IS
  'SECURITY DEFINER: scoped app_user/ai_user cleanup after canonical image success.';

COMMIT;
