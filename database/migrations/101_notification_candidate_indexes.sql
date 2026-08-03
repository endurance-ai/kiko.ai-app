-- Notification candidate read indexes.
--
-- The detector joins a user's followed brand to recent, deliverable products.
-- Keep this index in the public-schema owner instead of the ai-server Alembic
-- chain. It is intentionally partial so unavailable or image-less catalogue
-- rows do not inflate the hot read path.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_products_notification_brand_created
  ON products (brand_node_id, created_at DESC, id DESC)
  WHERE brand_node_id IS NOT NULL
    AND in_stock = true
    AND image_url IS NOT NULL;

COMMIT;
