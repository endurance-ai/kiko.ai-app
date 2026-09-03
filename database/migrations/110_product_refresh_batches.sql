-- Daily refresh batch manifest and source-level retry state.

BEGIN;

CREATE TABLE IF NOT EXISTS product_refresh_batches (
  id                    bigserial PRIMARY KEY,
  scheduled_for         date NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT now(),
  deadline_at           timestamptz NOT NULL,
  ended_at              timestamptz,
  status                text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','success','completed_with_exceptions','failed')),
  expected_source_count integer NOT NULL DEFAULT 0 CHECK (expected_source_count >= 0),
  success_source_count  integer NOT NULL DEFAULT 0 CHECK (success_source_count >= 0),
  exception_source_count integer NOT NULL DEFAULT 0 CHECK (exception_source_count >= 0),
  expected_product_count bigint NOT NULL DEFAULT 0 CHECK (expected_product_count >= 0),
  success_product_count bigint NOT NULL DEFAULT 0 CHECK (success_product_count >= 0),
  metrics               jsonb NOT NULL DEFAULT '{}'::jsonb
                        CHECK (jsonb_typeof(metrics) = 'object'),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_refresh_batch_sources (
  batch_id              bigint NOT NULL REFERENCES product_refresh_batches(id) ON DELETE CASCADE,
  platform_key          text NOT NULL REFERENCES product_refresh_sources(platform_key) ON DELETE CASCADE,
  platform_type         text NOT NULL,
  product_count         bigint NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','partial','success','exception')),
  attempts              integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_run_id           bigint REFERENCES product_refresh_runs(id) ON DELETE SET NULL,
  exception_code        text,
  exception_message     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, platform_key)
);

DROP TRIGGER IF EXISTS trg_product_refresh_batches_updated_at ON product_refresh_batches;
CREATE TRIGGER trg_product_refresh_batches_updated_at
  BEFORE UPDATE ON product_refresh_batches
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_refresh_batch_sources_updated_at ON product_refresh_batch_sources;
CREATE TRIGGER trg_product_refresh_batch_sources_updated_at
  BEFORE UPDATE ON product_refresh_batch_sources
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

ALTER TABLE product_refresh_runs
  ADD COLUMN IF NOT EXISTS batch_id bigint REFERENCES product_refresh_batches(id) ON DELETE SET NULL;

-- Keep source registration compatible with the engines added after migration 094.
ALTER TABLE product_refresh_sources DROP CONSTRAINT IF EXISTS product_refresh_sources_platform_type_check;
ALTER TABLE product_refresh_sources
  ADD CONSTRAINT product_refresh_sources_platform_type_check
  CHECK (platform_type IN (
    'cafe24','shopify','imweb','uniqlo','zara','29cm','farfetch','sixshop','structured'
  ));

-- The refresh worker already emits these states for interrupted slices. Keep
-- the database constraints aligned so partial progress can be checkpointed.
ALTER TABLE product_refresh_runs DROP CONSTRAINT IF EXISTS product_refresh_runs_status_check;
ALTER TABLE product_refresh_runs
  ADD CONSTRAINT product_refresh_runs_status_check
  CHECK (status IN ('running','partial','success','failed','skipped'));
ALTER TABLE product_refresh_sources DROP CONSTRAINT IF EXISTS product_refresh_sources_last_status_check;
ALTER TABLE product_refresh_sources
  ADD CONSTRAINT product_refresh_sources_last_status_check
  CHECK (last_status IS NULL OR last_status IN ('running','partial','success','failed','skipped'));

CREATE INDEX IF NOT EXISTS idx_product_refresh_batches_started
  ON product_refresh_batches (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_refresh_batch_sources_pending
  ON product_refresh_batch_sources (batch_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_product_refresh_runs_batch
  ON product_refresh_runs (batch_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON product_refresh_batches TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_refresh_batch_sources TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_refresh_batches_id_seq TO app_user;

COMMIT;
