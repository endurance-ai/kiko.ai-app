-- Manual contract phase. This file is intentionally outside database/migrations
-- and is never selected by the dev deployment workflow.
--
-- Apply only after:
--   1. migrations 121 and 123 are installed;
--   2. ai-server PR #286 is deployed and its deployed commit is recorded below;
--   3. crawler PR #127 is deployed to the lab host and its running checkout commit
--      is recorded below; merging #127 is insufficient because crawler has no
--      dev deployment workflow.
--
-- Example (requires a separate approval because this writes the remote DB):
--   psql -v ON_ERROR_STOP=1 \
--     -v ai_deployed_sha=<deployed-ai-commit> \
--     -v crawler_deployed_sha=<deployed-crawler-commit> \
--     "$DATABASE_URL" \
--     -f database/runbooks/post-rollout-revoke-legacy-product-embedding-writes.sql

\if :{?ai_deployed_sha}
\else
  \set ai_deployed_sha ''
\endif
\if :{?crawler_deployed_sha}
\else
  \set crawler_deployed_sha ''
\endif

SELECT set_config('kiko.rollout.ai_deployed_sha', :'ai_deployed_sha', false);
SELECT set_config('kiko.rollout.crawler_deployed_sha', :'crawler_deployed_sha', false);

BEGIN;

DO $$
BEGIN
  IF current_setting('kiko.rollout.ai_deployed_sha') !~ '^[0-9a-f]{7,40}$' THEN
    RAISE EXCEPTION 'ai_deployed_sha must be the verified deployed git commit';
  END IF;
  IF current_setting('kiko.rollout.crawler_deployed_sha') !~ '^[0-9a-f]{7,40}$' THEN
    RAISE EXCEPTION 'crawler_deployed_sha must be the verified running lab checkout commit';
  END IF;
  IF to_regprocedure('public.bulk_update_product_embeddings_v2(jsonb)') IS NULL
     OR to_regprocedure('public.invalidate_stale_product_embeddings_v2(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'embedding expansion RPCs are not installed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_product_embeddings(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_product_embeddings(jsonb) FROM app_user, ai_user;

REVOKE INSERT, UPDATE, DELETE ON public.product_embeddings FROM app_user, ai_user;
GRANT SELECT ON public.product_embeddings TO app_user, ai_user;
GRANT EXECUTE ON FUNCTION public.bulk_update_product_embeddings_v2(jsonb) TO app_user, ai_user;
GRANT EXECUTE ON FUNCTION public.invalidate_stale_product_embeddings_v2(jsonb) TO app_user, ai_user;

COMMENT ON FUNCTION public.bulk_update_product_embeddings(jsonb) IS
  'RETIRED after v2 caller rollout. Normal roles cannot execute this provenance-free writer.';

COMMIT;
