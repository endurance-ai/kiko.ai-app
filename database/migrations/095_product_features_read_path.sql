-- 095_product_features_read_path.sql
-- VLM product_features 를 gender/color 의 단일 출처로 승격하기 위한 읽기 경로 준비.
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- 크롤러(규칙 + LLM hybrid)로 gender/color 를 안정적으로 뽑는 데 실패했다.
--   products.color vs VLM primary_color 일치율 54.8% (71,775 / 131,058)
--   products.gender 에 canonical 밖 값 잔존: {kids} 351, {unknown} 301, {baby} 170
--     (091 의 CHECK 가 NOT VALID 라 legacy 행이 통과 중)
-- 이 오염된 값이 search_products_v6 의 **모든 rung 하드 필터**로 쓰여 왔다.
-- → 색/성별의 출처를 product_features 로 옮긴다.
--
-- ── 이 파일이 하는 일 ────────────────────────────────────────────────────
-- product_features 는 dev DB 에 실물로만 존재하고 이 리포의 migration/코드
-- 어디에도 정의가 없었다 (참조 0건). 이 마이그레이션이 실물 스키마를 코드로
-- 기록하는 역할을 겸한다 — 아래 CREATE TABLE 은 2026-07-29 시점 실물과
-- 동일하며 IF NOT EXISTS 라 기존 dev DB 에서는 no-op 이다.
--
-- ── 인덱스를 왜 새로 만드나 ──────────────────────────────────────────────
-- 기존 idx_product_features_metadata_gin 은 jsonb_path_ops 라
-- `feature_metadata->>'primary_color' = 'BLACK'` 형태의 **텍스트 등치 비교를
-- 타지 못한다** (jsonb_path_ops 는 @> 계열 containment 전용). v6 RPC 가 3개
-- rung + 2개 count 프리체크에서 매번 이 술어를 평가하므로 표현식 btree 인덱스가
-- 필수다.

BEGIN;

-- ── 실물 스키마 기록 (기존 DB 에서는 no-op) ───────────────────────────────
CREATE TABLE IF NOT EXISTS product_features (
  product_id       bigint PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  retrieval_text   text NOT NULL,
  feature_metadata jsonb NOT NULL,
  text_embedding   halfvec(768),
  embedding_model  text,
  feature_version  text NOT NULL,
  vlm_model        text NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE product_features IS
  'VLM(Qwen3-VL) 생성 상품 피처. gender/color 의 단일 출처 (products.gender/color 대체).';
COMMENT ON COLUMN product_features.feature_metadata IS
  'primary_color(16 canonical family, UPPERCASE) / secondary_colors[] / gender(men|women|unisex) / material / pattern / fit / neckline / style_tags / details';

-- ── 검색 필터용 표현식 인덱스 ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pf_primary_color
  ON product_features ((feature_metadata->>'primary_color'));

CREATE INDEX IF NOT EXISTS idx_pf_gender
  ON product_features ((feature_metadata->>'gender'));

-- ── gender 어휘 계약 고정 ────────────────────────────────────────────────
-- 현재 gender 키를 가진 행은 1건뿐이고 그 값이 'woman' 이다 (products.gender
-- 어휘는 'women'). VLM 배치가 본격적으로 gender 를 채우기 전에 어휘를 못박아
-- 두지 않으면 products.gender 와 어긋난 채로 131k 행이 생성된다.
--
-- NOT VALID: 기존 1건('woman')이 배포를 막지 않게 한다. VLM 재생성으로
-- 어휘가 정리되면 VALIDATE CONSTRAINT 로 승격할 것.
ALTER TABLE product_features
  DROP CONSTRAINT IF EXISTS chk_pf_gender_vocab;

ALTER TABLE product_features
  ADD CONSTRAINT chk_pf_gender_vocab
  CHECK (
    feature_metadata->>'gender' IS NULL
    OR feature_metadata->>'gender' IN ('men', 'women', 'unisex')
  ) NOT VALID;

COMMENT ON CONSTRAINT chk_pf_gender_vocab ON product_features IS
  'VLM gender 어휘 계약: men|women|unisex 소문자 스칼라. 단일 이미지 → 단일 판정이므로 배열이 아니다. NOT VALID (legacy 1행 ''woman'' 존재).';

COMMIT;

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────
-- 1) 인덱스가 실제로 타는지 (Seq Scan 이면 무의미):
--      EXPLAIN ANALYZE SELECT count(*) FROM product_features
--        WHERE feature_metadata->>'primary_color' = 'BLACK';
-- 2) 커버리지 (검색 실모수 = in_stock + product_embeddings 기준):
--      SELECT count(*) FILTER (WHERE f.product_id IS NOT NULL), count(*)
--      FROM products p
--      JOIN product_embeddings e ON e.product_id = p.id
--      LEFT JOIN product_features f ON f.product_id = p.id
--      WHERE p.in_stock;
--    2026-07-29 기준선: 79,283 / 82,397 (96.2%)
