-- 094_product_refresh_sources.sql
-- Source-level listing refresh state. Brand onboarding remains keyed by
-- brand_nodes; a storefront refresh is keyed by platform_key because one
-- multi-brand source can own products from hundreds of brand nodes.

BEGIN;

CREATE TABLE IF NOT EXISTS product_refresh_sources (
  platform_key          text PRIMARY KEY CHECK (length(trim(platform_key)) > 0),
  platform_type         text NOT NULL CHECK (platform_type IN (
                            'cafe24','shopify','imweb','uniqlo',
                            'zara','29cm','farfetch'
                          )),
  base_url              text NOT NULL CHECK (base_url ~* '^https?://'),
  enabled               boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_attempted_at     timestamptz,
  last_succeeded_at     timestamptz,
  last_status           text CHECK (last_status IN ('running','success','failed','skipped')),
  last_error            text
);

DROP TRIGGER IF EXISTS trg_product_refresh_sources_updated_at ON product_refresh_sources;
CREATE TRIGGER trg_product_refresh_sources_updated_at
  BEFORE UPDATE ON product_refresh_sources
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_refresh_sources_queue
  ON product_refresh_sources (enabled, last_attempted_at ASC NULLS FIRST);

CREATE TABLE IF NOT EXISTS product_refresh_runs (
  id                    bigserial PRIMARY KEY,
  platform_key          text NOT NULL REFERENCES product_refresh_sources(platform_key) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  duration_ms           integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status                text NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','success','failed','skipped')),
  command               text,
  metrics               jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(metrics) = 'object'),
  error_message         text
);

CREATE INDEX IF NOT EXISTS idx_product_refresh_runs_source_created
  ON product_refresh_runs (platform_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_refresh_runs_created
  ON product_refresh_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS product_refresh_candidates (
  id                    bigserial PRIMARY KEY,
  platform_key          text NOT NULL REFERENCES product_refresh_sources(platform_key) ON DELETE CASCADE,
  identity_key          text NOT NULL,
  product_url           text NOT NULL CHECK (product_url ~* '^https?://'),
  raw_product           jsonb NOT NULL CHECK (jsonb_typeof(raw_product) = 'object'),
  detected_brand        text,
  matched_brand_node_id bigint REFERENCES brand_nodes(id) ON DELETE RESTRICT,
  status                text NOT NULL DEFAULT 'discovered'
                          CHECK (status IN (
                            'discovered','brand_unmatched','enriching','ready',
                            'imported','rejected','failed'
                          )),
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  next_attempt_at       timestamptz,
  llm_model             text,
  llm_usage             jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(llm_usage) = 'object'),
  llm_cost_usd          numeric,
  enriched_product      jsonb CHECK (
                            enriched_product IS NULL
                            OR jsonb_typeof(enriched_product) = 'object'
                          ),
  imported_product_id   bigint REFERENCES products(id) ON DELETE SET NULL,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_key, identity_key),
  CHECK (status = 'brand_unmatched' OR matched_brand_node_id IS NOT NULL)
);

DROP TRIGGER IF EXISTS trg_product_refresh_candidates_updated_at ON product_refresh_candidates;
CREATE TRIGGER trg_product_refresh_candidates_updated_at
  BEFORE UPDATE ON product_refresh_candidates
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_refresh_candidates_pending
  ON product_refresh_candidates (status, next_attempt_at, first_seen_at)
  WHERE status IN ('discovered','failed');
CREATE INDEX IF NOT EXISTS idx_product_refresh_candidates_brand
  ON product_refresh_candidates (matched_brand_node_id, status);

CREATE INDEX IF NOT EXISTS idx_products_platform
  ON products (platform);

CREATE OR REPLACE FUNCTION product_refresh_source_stats()
RETURNS TABLE (platform_key text, product_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.platform::text, count(*)::bigint
  FROM products p
  WHERE p.platform IS NOT NULL AND p.platform <> ''
  GROUP BY p.platform;
$$;

CREATE OR REPLACE FUNCTION claim_product_refresh_candidates(
  p_limit integer DEFAULT 50,
  p_max_attempts integer DEFAULT 3
)
RETURNS SETOF product_refresh_candidates
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT c.id
    FROM product_refresh_candidates c
    WHERE c.matched_brand_node_id IS NOT NULL
      AND c.attempt_count < greatest(1, least(p_max_attempts, 10))
      AND (
        (
          c.status IN ('discovered','failed')
          AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
        )
        OR (
          c.status = 'enriching'
          AND c.updated_at < now() - interval '30 minutes'
        )
      )
    ORDER BY c.first_seen_at, c.id
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 200))
  )
  UPDATE product_refresh_candidates c
  SET
    status = 'enriching',
    attempt_count = c.attempt_count + 1,
    next_attempt_at = NULL,
    last_error = NULL
  FROM picked
  WHERE c.id = picked.id
  RETURNING c.*;
END;
$$;

COMMENT ON TABLE product_refresh_sources IS
  'Listing refresh queue keyed by storefront/source platform_key, separate from brand-node onboarding state.';
COMMENT ON TABLE product_refresh_runs IS
  'Per-source listing refresh execution history and coverage/update metrics.';
COMMENT ON TABLE product_refresh_candidates IS
  'New product URLs discovered during refresh. Only exact existing-brand matches may pass through LLM enrichment and import.';
COMMENT ON FUNCTION product_refresh_source_stats() IS
  'Current products row count grouped by source platform key for refresh worklist construction.';
COMMENT ON FUNCTION claim_product_refresh_candidates(integer, integer) IS
  'Atomically claims existing-brand new-product candidates for LLM enrichment with stale-worker recovery.';

GRANT SELECT, INSERT, UPDATE, DELETE ON product_refresh_sources TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_refresh_runs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_refresh_candidates TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_refresh_runs_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE product_refresh_candidates_id_seq TO app_user;
GRANT EXECUTE ON FUNCTION product_refresh_source_stats() TO app_user;
GRANT EXECUTE ON FUNCTION claim_product_refresh_candidates(integer, integer) TO app_user;

COMMIT;
