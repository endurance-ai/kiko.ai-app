-- Add executable crawler engines introduced for previously unrefreshable
-- storefronts. `sixshop` uses the public catalog API; `structured` refreshes
-- stock/last_seen for existing product URLs through schema.org Product data.

BEGIN;

ALTER TABLE product_refresh_sources
  DROP CONSTRAINT IF EXISTS product_refresh_sources_platform_type_check;

ALTER TABLE product_refresh_sources
  ADD CONSTRAINT product_refresh_sources_platform_type_check
  CHECK (platform_type IN (
    'cafe24', 'shopify', 'imweb', 'uniqlo', 'zara', '29cm', 'farfetch',
    'sixshop', 'structured'
  ));

COMMIT;
