-- 100_claim_candidates_origin_filter.sql
-- claim_product_refresh_candidates() 에 origin_country 필터를 추가한다.
--
-- 왜 필요한가:
--   신규상품 후보 큐 75,404건의 브랜드 origin 분포 (실측 2026-08-01):
--     KR 58,917 (78%) · US 4,556 · JP 2,505 · GB 1,500 · 미상 1,799 · 기타
--   현재 운영 방침은 한국 브랜드 우선이라 비KR 16,487건은 지금 태울 대상이 아니다.
--   후보 1건 = 상세 크롤 + LLM 1회이므로 대상이 아닌 것을 태우면 그대로 비용이다.
--
--   필터를 클라이언트에 둘 수 없는 이유: 이 함수가 `ORDER BY first_seen_at, id`
--   로 행을 직접 고르고 그 자리에서 status='enriching' 으로 잠근다. 워커가 받은
--   뒤 걸러 봐야 이미 claim 된 상태라, 되돌리면 다음 claim 이 같은 행을 또 집는
--   무한 루프가 된다. 선택 시점에 걸러야 한다.
--
-- 시그니처를 바꾸는 방식 (2-arg DROP + 3-arg CREATE):
--   DEFAULT 를 가진 3-arg 를 추가만 하면 2-arg 와 함께 존재해 `{p_limit,
--   p_max_attempts}` 호출이 Postgres 에서 모호해진다(function is not unique).
--   그래서 2-arg 를 DROP 한다. 적용 시점에 이 RPC 를 부르는 상시 실행체는 없다 —
--   워커는 refresh 성공 시(OnSuccess) 만 도는 일회성이고, 타이머는 아직
--   설치 전이다. 크롤러 쪽 호출부는 같은 PR 로 3-arg 를 넘기도록 바뀐다.
--
-- p_origin_country IS NULL 이면 필터 없음 = 기존 동작. 전량 처리로 되돌릴 때
--   워커 플래그만 빼면 된다.

BEGIN;

DROP FUNCTION IF EXISTS claim_product_refresh_candidates(integer, integer);

CREATE FUNCTION claim_product_refresh_candidates(
  p_limit integer DEFAULT 50,
  p_max_attempts integer DEFAULT 3,
  p_origin_country text DEFAULT NULL
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
    JOIN brand_nodes bn ON bn.id = c.matched_brand_node_id
    WHERE c.matched_brand_node_id IS NOT NULL
      AND c.attempt_count < greatest(1, least(p_max_attempts, 10))
      AND (
        p_origin_country IS NULL
        OR bn.wiki->>'origin_country' = p_origin_country
      )
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
    FOR UPDATE OF c SKIP LOCKED
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

COMMENT ON FUNCTION claim_product_refresh_candidates(integer, integer, text) IS
  'Atomically claims existing-brand new-product candidates for LLM enrichment with stale-worker recovery. p_origin_country filters by brand_nodes.wiki->>origin_country (NULL = no filter).';

GRANT EXECUTE ON FUNCTION claim_product_refresh_candidates(integer, integer, text) TO app_user;

COMMIT;

-- 적용 후 확인 — KR 만 잡히는지 (claim 하지 않고 대상 수만):
--   SELECT bn.wiki->>'origin_country' AS origin, count(*)
--   FROM product_refresh_candidates c JOIN brand_nodes bn ON bn.id = c.matched_brand_node_id
--   WHERE c.status IN ('discovered','failed') GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
