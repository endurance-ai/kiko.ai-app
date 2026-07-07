-- 092_simplify_crawl_status.sql
-- Collapse product_crawl_status.status from 13 values down to the 8 that automation
-- actually sets. needs_config/config_ready duplicated the separate config_status column;
-- crawl_ready/embed_ready were never set or polled by any pipeline code; import_ready was
-- a legacy manual-QC-gate value superseded by crawl.ts/import-products.ts auto-sync
-- (2026-07-06). Kept idempotent so the deploy pipeline can safely apply this catch-up
-- migration.

BEGIN;

-- 1) Remap existing rows off the values being dropped, before tightening the CHECK.
UPDATE product_crawl_status
SET status = 'tech_detected'
WHERE status IN ('needs_config', 'config_ready', 'crawl_ready');

UPDATE product_crawl_status
SET status = 'crawled'
WHERE status = 'import_ready';

UPDATE product_crawl_status
SET status = 'imported'
WHERE status = 'embed_ready';

-- 2) crawl_ready_at was named after the now-removed crawl_ready status, but
-- crawl.ts has been writing it on status="crawled" since 2026-07-06 — rename
-- for clarity. Not rendered anywhere in the admin frontend, safe to rename.
ALTER TABLE product_crawl_status RENAME COLUMN crawl_ready_at TO crawled_at;

-- 3) Replace the CHECK constraint with the 8-value list.
ALTER TABLE product_crawl_status DROP CONSTRAINT IF EXISTS product_crawl_status_status_check;
ALTER TABLE product_crawl_status ADD CONSTRAINT product_crawl_status_status_check
  CHECK (status IN (
    'not_started',
    'tech_detected',
    'crawled',
    'qc_failed',
    'imported',
    'embedded',
    'active',
    'blocked'
  ));

COMMENT ON COLUMN product_crawl_status.status IS
  'Crawl workflow state for a brand_node: detection, crawl, QC failure, import, embedding, activation, or blocked.';

COMMIT;
