-- 090_product_collection_queue.sql
-- Product collection workflow queue for planner-owned brand selection and
-- crawler-owned product ingestion stages.

BEGIN;

CREATE TABLE IF NOT EXISTS product_collection_targets (
  id                    bigserial PRIMARY KEY,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  updated_by            text,

  -- Planner-owned inputs.
  brand_name            text NOT NULL CHECK (length(trim(brand_name)) > 0),
  homepage_url          text NOT NULL UNIQUE CHECK (homepage_url ~* '^https?://'),
  gender_scope          text[] NOT NULL DEFAULT '{}'::text[],
  price_band            text NOT NULL DEFAULT 'unknown'
                            CHECK (price_band IN ('unknown','budget','mid','premium','luxury')),
  priority              smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  planner_status        text NOT NULL DEFAULT 'planner_draft'
                            CHECK (planner_status IN (
                              'planner_draft',
                              'planner_classified',
                              'product_collection_requested',
                              'cancelled'
                            )),
  planner_notes         text,
  requested_at          timestamptz,

  -- Crawler/developer-owned handling state.
  platform_key          text,
  platform_type         text NOT NULL DEFAULT 'unknown'
                            CHECK (platform_type IN (
                              'unknown','cafe24','shopify','custom',
                              'uniqlo','zara','29cm','farfetch'
                            )),
  category_discovery    text NOT NULL DEFAULT 'unknown'
                            CHECK (category_discovery IN ('unknown','manual','auto')),
  categories            jsonb NOT NULL DEFAULT '[]'::jsonb
                            CHECK (jsonb_typeof(categories) = 'array'),
  detection             jsonb NOT NULL DEFAULT '{}'::jsonb
                            CHECK (jsonb_typeof(detection) = 'object'),
  tech_status           text NOT NULL DEFAULT 'not_started'
                            CHECK (tech_status IN (
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
  config_status         text NOT NULL DEFAULT 'not_started'
                            CHECK (config_status IN ('not_started','needed','ready','blocked')),
  latest_artifact_path  text,
  latest_artifact_sha256 text,
  qc_summary            jsonb NOT NULL DEFAULT '{}'::jsonb
                            CHECK (jsonb_typeof(qc_summary) = 'object'),
  last_error            text,
  blocked_reason        text,
  tech_notes            text,
  detected_at           timestamptz,
  crawl_ready_at        timestamptz,
  imported_at           timestamptz,
  embedded_at           timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_collection_targets_platform_key
  ON product_collection_targets (platform_key)
  WHERE platform_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_collection_targets_planner_status
  ON product_collection_targets (planner_status);
CREATE INDEX IF NOT EXISTS idx_product_collection_targets_tech_status
  ON product_collection_targets (tech_status);
CREATE INDEX IF NOT EXISTS idx_product_collection_targets_priority
  ON product_collection_targets (priority, updated_at DESC);

CREATE TRIGGER trg_product_collection_targets_updated_at
  BEFORE UPDATE ON product_collection_targets
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

CREATE TABLE IF NOT EXISTS product_collection_runs (
  id              bigserial PRIMARY KEY,
  target_id       bigint REFERENCES product_collection_targets(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_product_collection_runs_target_created
  ON product_collection_runs (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_collection_runs_stage_status
  ON product_collection_runs (stage, status);
CREATE INDEX IF NOT EXISTS idx_product_collection_runs_created_at
  ON product_collection_runs (created_at DESC);

COMMENT ON TABLE product_collection_targets IS
  'Planner-to-crawler product collection queue. Planner fields decide whether a brand should be collected; tech fields track site detection, config, crawl QC, import, and embedding readiness.';
COMMENT ON TABLE product_collection_runs IS
  'Execution history for product collection stages: detect, config, crawl, qc, import, embed, and manual admin transitions.';
COMMENT ON COLUMN product_collection_targets.planner_status IS
  'Planner-owned workflow: planner_draft -> planner_classified -> product_collection_requested.';
COMMENT ON COLUMN product_collection_targets.tech_status IS
  'Crawler/developer-owned workflow after product_collection_requested.';
COMMENT ON COLUMN product_collection_targets.qc_summary IS
  'Latest crawl artifact QC summary: product count, category/color/price/image fill rates, and pass/fail details.';

GRANT SELECT, INSERT, UPDATE, DELETE ON product_collection_targets TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_collection_runs TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_collection_targets_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_collection_runs_id_seq TO app_user;

COMMIT;
