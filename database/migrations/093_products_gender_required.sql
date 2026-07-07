-- 093_products_gender_required.sql
-- Recommendation quality gate: products.gender must be present for new writes.
--
-- Historical rows may still have NULL/empty gender. Backfill from
-- brand_nodes.gender_scope where possible, then add a NOT VALID CHECK:
-- PostgreSQL enforces it for new/updated rows without blocking deployment on
-- legacy rows that still need manual classification.

UPDATE products p
SET gender = (
  SELECT array_agg(DISTINCT g)
  FROM unnest(bn.gender_scope) AS g
  WHERE g IN ('men', 'women', 'unisex')
)
FROM brand_nodes bn
WHERE p.brand_node_id = bn.id
  AND (p.gender IS NULL OR cardinality(p.gender) = 0)
  AND bn.gender_scope IS NOT NULL
  AND cardinality(bn.gender_scope) > 0;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_gender_required;

ALTER TABLE products
  ADD CONSTRAINT chk_products_gender_required
  CHECK (
    gender IS NOT NULL
    AND cardinality(gender) > 0
    AND array_position(gender, NULL) IS NULL
    AND gender <@ ARRAY['men', 'women', 'unisex']::text[]
  ) NOT VALID;

COMMENT ON CONSTRAINT chk_products_gender_required ON products IS
  'products.gender is required for new/updated rows; valid values: men, women, unisex. Added NOT VALID to avoid blocking on historical rows.';
