-- 091_brand_node_product_crawl_status.sql
-- Track product crawling state against brand_nodes, not an URL-first queue.
-- Kept idempotent so the deploy pipeline can safely apply this catch-up migration.

BEGIN;

DROP VIEW IF EXISTS product_crawl_brands;
DROP TABLE IF EXISTS product_collection_runs;
DROP TABLE IF EXISTS product_collection_targets;

CREATE TABLE IF NOT EXISTS product_crawl_status (
  brand_node_id          bigint PRIMARY KEY REFERENCES brand_nodes(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  status                 text NOT NULL DEFAULT 'not_started'
                           CHECK (status IN (
                             'not_started',
                             'tech_detected',
                             'needs_config',
                             'config_ready',
                             'crawl_ready',
                             'crawled',
                             'qc_failed',
                             'import_ready',
                             'imported',
                             'embed_ready',
                             'embedded',
                             'active',
                             'blocked'
                           )),
  config_status          text NOT NULL DEFAULT 'not_started'
                           CHECK (config_status IN ('not_started','needed','ready','blocked')),
  platform_key           text,
  platform_type          text NOT NULL DEFAULT 'unknown'
                           CHECK (platform_type IN (
                             'unknown','cafe24','shopify','custom',
                             'uniqlo','zara','29cm','farfetch'
                           )),
  category_discovery     text NOT NULL DEFAULT 'unknown'
                           CHECK (category_discovery IN ('unknown','manual','auto')),
  categories             jsonb NOT NULL DEFAULT '[]'::jsonb
                           CHECK (jsonb_typeof(categories) = 'array'),
  detection              jsonb NOT NULL DEFAULT '{}'::jsonb
                           CHECK (jsonb_typeof(detection) = 'object'),
  latest_artifact_path   text,
  latest_artifact_sha256 text,
  qc_summary             jsonb NOT NULL DEFAULT '{}'::jsonb
                           CHECK (jsonb_typeof(qc_summary) = 'object'),
  last_error             text,
  blocked_reason         text,
  notes                  text,
  detected_at            timestamptz,
  crawl_ready_at         timestamptz,
  imported_at            timestamptz,
  embedded_at            timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_crawl_status_platform_key
  ON product_crawl_status (platform_key)
  WHERE platform_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_crawl_status_status
  ON product_crawl_status (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_crawl_status_platform_type
  ON product_crawl_status (platform_type);

DROP TRIGGER IF EXISTS trg_product_crawl_status_updated_at ON product_crawl_status;
CREATE TRIGGER trg_product_crawl_status_updated_at
  BEFORE UPDATE ON product_crawl_status
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

CREATE TABLE IF NOT EXISTS product_crawl_runs (
  id              bigserial PRIMARY KEY,
  brand_node_id   bigint NOT NULL REFERENCES brand_nodes(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  duration_ms     integer,
  stage           text NOT NULL CHECK (stage IN ('detect','config','crawl','qc','import','embed','manual')),
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('queued','running','success','failed','skipped')),
  command         text,
  actor           text,
  platform_key    text,
  metrics         jsonb NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(metrics) = 'object'),
  artifact_path   text,
  error_message   text
);

CREATE INDEX IF NOT EXISTS idx_product_crawl_runs_brand_created
  ON product_crawl_runs (brand_node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_crawl_runs_stage_status
  ON product_crawl_runs (stage, status);
CREATE INDEX IF NOT EXISTS idx_product_crawl_runs_created_at
  ON product_crawl_runs (created_at DESC);

CREATE OR REPLACE VIEW product_crawl_brands AS
SELECT
  b.id AS brand_node_id,
  b.brand_name,
  b.brand_name_normalized,
  b.gender_scope,
  b.source_platforms,
  b.price_min_usd,
  b.price_max_usd,
  b.wiki,
  b.wiki->>'homepage_url' AS homepage_url,
  b.wiki->>'status' AS wiki_status,
  b.updated_at AS brand_updated_at,
  pcs.created_at AS status_created_at,
  pcs.updated_at AS status_updated_at,
  pcs.brand_node_id IS NOT NULL AS has_status_row,
  COALESCE(pcs.status, 'not_started') AS status,
  COALESCE(pcs.config_status, 'not_started') AS config_status,
  pcs.platform_key,
  COALESCE(pcs.platform_type, 'unknown') AS platform_type,
  COALESCE(pcs.category_discovery, 'unknown') AS category_discovery,
  COALESCE(pcs.categories, '[]'::jsonb) AS categories,
  COALESCE(pcs.detection, '{}'::jsonb) AS detection,
  pcs.latest_artifact_path,
  pcs.latest_artifact_sha256,
  COALESCE(pcs.qc_summary, '{}'::jsonb) AS qc_summary,
  pcs.last_error,
  pcs.blocked_reason,
  pcs.notes,
  pcs.detected_at,
  pcs.crawl_ready_at,
  pcs.imported_at,
  pcs.embedded_at
FROM brand_nodes b
LEFT JOIN product_crawl_status pcs ON pcs.brand_node_id = b.id;

COMMENT ON TABLE product_crawl_status IS
  'Product crawling state keyed by brand_nodes.id. Brand selection and homepage URL enrichment happen in brand_nodes/wiki before this workflow.';
COMMENT ON TABLE product_crawl_runs IS
  'Execution history for brand-node product crawling stages: detect, config, crawl, qc, import, embed, and manual admin transitions.';
COMMENT ON VIEW product_crawl_brands IS
  'Admin/crawler read model joining brand_nodes with product_crawl_status defaults.';
COMMENT ON COLUMN product_crawl_status.status IS
  'Crawl workflow state for a brand_node: detection, config, crawl QC, import, embedding, activation, or blocked.';

GRANT SELECT, INSERT, UPDATE, DELETE ON product_crawl_status TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_crawl_runs TO app_user;
GRANT SELECT ON product_crawl_brands TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_crawl_runs_id_seq TO app_user;

COMMIT;
