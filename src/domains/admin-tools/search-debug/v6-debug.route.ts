import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {buildDebugEmbedding, type EmbedMode, type ModalEmbedTrace, toVectorLiteral} from "./embed-modes"
import {rewriteQuery, type RewriteResponse, visionAnalyze, type VisionResponse} from "./ai-client"
import {isAllowedImageUrl} from "./url-allow"
import {
  diversifySearchResults,
  isHttpImageUrl,
  SEARCH_DEBUG_BRAND_CAP,
} from "./result-diversity"

// 어드민 v6 검색 디버거 백엔드.
// 입력: image_url 또는 text 또는 둘다 + 선택 필터 (style_node, category, brand)
// 출력: 임베딩 trace + 파이프라인 trace (FILTER1/2/3 row counts) + RPC 결과 augmented
//
// 옵션 스텝:
//  - run_rewrite: ai/ debug.rewrite-query 호출 → ReAct LLM 이 텍스트를 영어로 정제
//  - apply_rewrite: 정제 결과를 임베딩 입력으로 사용 (false 면 trace 만 표시)
//  - run_vision: ai/ debug.vision-analyze 호출 → 이미지 분석 trace (임베딩 흐름엔 영향 없음)

export const maxDuration = 90

interface DebugRequest {
  mode: EmbedMode
  image_url?: string
  text?: string
  style_node_code?: string
  category?: string
  subcategory?: string
  brand_names?: string[]
  // 2026-07-29: 운영(AI 서버)은 8-arg 로 호출하는데 이 라우트가 5-key 만 넘겨
  // p_color_family/p_gender 를 누락, 어드민 디버거가 운영 필터를 재현하지 못했다.
  color_family?: string
  gender?: string
  limit?: number
  run_rewrite?: boolean
  rewrite_model_id?: string
  apply_rewrite?: boolean
  run_vision?: boolean
  auto_wire_category?: boolean   // Vision picked_item.category → p_category 자동 주입 (수동 category 입력 우선)
}

type V6Row = {
  id: number
  brand: string
  name: string
  price: number | null
  image_url: string | null
  product_url: string | null
  platform: string | null
  subcategory: string | null
  distance: number
  degraded: boolean
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  let body: DebugRequest
  try {
    body = (await request.json()) as DebugRequest
  } catch {
    return NextResponse.json({error: "invalid JSON body"}, {status: 400})
  }

  const mode: EmbedMode = body.mode ?? "text"
  const limit = Math.min(Math.max(body.limit ?? 30, 1), 100)
  // 관련도 상위 풀을 충분히 확보한 다음 브랜드 cap 을 적용한다. 요청 limit 만
  // 가져오면 한 브랜드가 상위를 독점한 경우 cap 이후 결과가 지나치게 적어진다.
  const candidateLimit = Math.min(Math.max(limit * 4, limit), 100)

  // SSRF 방어: image_url 은 화이트리스트 CDN 만 허용 (ai/ vision + Modal /embed 둘 다 fetch)
  if (body.image_url && !isAllowedImageUrl(body.image_url)) {
    return NextResponse.json(
      {stage: "embedding", error: "image_url host not in whitelist"},
      {status: 403}
    )
  }

  // ── 0a) (optional) LLM rewrite — Korean → English keyword query ─
  let rewriteResult: RewriteResponse | {ok: false; error: string} | null = null
  let textForEmbed = body.text
  if (body.run_rewrite && body.text && body.text.trim().length > 0) {
    rewriteResult = await rewriteQuery({
      user_text: body.text,
      model_id: body.rewrite_model_id,
      include_system_prompt: false,
    })
    if (
      body.apply_rewrite !== false &&
      "ok" in rewriteResult &&
      rewriteResult.ok &&
      rewriteResult.parsed_text_query
    ) {
      textForEmbed = rewriteResult.parsed_text_query
    }
  }

  // ── 0b) (optional) Vision analyze ──────────────────────────────
  // production 봇 path 와 동일: Vision picked_item.category 가 RPC p_category 로 흐름.
  // 사용자가 수동 category 를 입력하면 그게 우선.
  let visionResult: VisionResponse | {ok: false; error: string} | null = null
  let autoWiredCategory: string | null = null
  if (body.run_vision && body.image_url) {
    visionResult = await visionAnalyze({image_url: body.image_url})
    if (
      body.auto_wire_category !== false &&
      "ok" in visionResult &&
      visionResult.ok &&
      visionResult.items.length > 0
    ) {
      const idx = visionResult.picked_item_index ?? 0
      const picked = visionResult.items[idx]
      if (picked?.category) {
        autoWiredCategory = picked.category
      }
    }
  }
  // 최종 category — 수동 입력 우선, 없으면 자동 와이어링 결과
  const effectiveCategory = body.category?.trim() || autoWiredCategory || null

  // ── 1) 임베딩 빌드 ────────────────────────────────────────────
  const embed = await buildDebugEmbedding({
    imageUrl: body.image_url,
    text: textForEmbed,
    mode,
  })
  if (!embed.ok || !embed.embedding) {
    return NextResponse.json({
      stage: "embedding",
      error: embed.error ?? "embedding failed",
      rewrite_trace: rewriteResult,
      vision_trace: visionResult,
      text_used_for_embed: textForEmbed ?? null,
      embedding_trace: {
        mode,
        fused: false,
        final_norm: null,
        modal_calls: embed.traces,
        total_latency_ms: embed.total_latency_ms,
      },
    })
  }

  // ── 2) style_node code → id 변환 ─────────────────────────────
  let styleNodeId: number | null = null
  let styleNodeMatchBrands = 0
  let styleNodeLookupLatency = 0
  if (body.style_node_code) {
    const t = Date.now()
    const {data: sn} = await supabase
      .from("style_nodes")
      .select("id")
      .eq("code", body.style_node_code)
      .maybeSingle()
    styleNodeId = (sn as {id: number} | null)?.id ?? null
    if (styleNodeId != null) {
      const {count} = await supabase
        .from("brand_nodes")
        .select("id", {count: "exact", head: true})
        .eq("primary_style_node_id", styleNodeId)
      styleNodeMatchBrands = count ?? 0
    }
    styleNodeLookupLatency = Date.now() - t
  }

  // ── 3) category canonical family lookup ─────────────────────
  let targetFamily: string | null = null
  let familyMatchProducts: number | null = null
  let familyLookupLatency = 0
  if (effectiveCategory) {
    const t = Date.now()
    const {data: cc} = await supabase
      .from("category_canonical")
      .select("family")
      .eq("raw_category", effectiveCategory)
      .maybeSingle()
    targetFamily = (cc as {family: string} | null)?.family ?? null
    if (targetFamily && targetFamily !== "other") {
      const {count} = await supabase
        .from("category_canonical")
        .select("raw_category", {count: "exact", head: true})
        .eq("family", targetFamily)
      familyMatchProducts = count ?? 0
    }
    familyLookupLatency = Date.now() - t
  }

  // ── 4) v6 RPC 호출 ──────────────────────────────────────────
  const embeddingLiteral = toVectorLiteral(embed.embedding)
  const rpcT0 = Date.now()
  const {data: rpcData, error: rpcError} = await supabase.rpc("search_products_v6", {
    query_embedding: embeddingLiteral,
    p_style_node_id: styleNodeId,
    p_category: effectiveCategory,
    p_subcategory: body.subcategory ?? null,
    p_brand_names: body.brand_names && body.brand_names.length > 0 ? body.brand_names : null,
    // 8-arg 전체를 넘긴다. 이 두 개를 빼고 5-key 로만 호출하던 동안 디버거가
    // 운영 필터를 재현하지 못했다 — 색상·성별 필터가 걸린 검색을 디버깅할 수 없었다.
    p_color_family: body.color_family?.trim().toUpperCase() || null,
    p_gender: body.gender?.trim().toLowerCase() || null,
    p_limit: candidateLimit,
  })
  const rpcLatency = Date.now() - rpcT0

  if (rpcError) {
    return NextResponse.json({
      stage: "rpc",
      error: rpcError.message,
      rewrite_trace: rewriteResult,
      vision_trace: visionResult,
      text_used_for_embed: textForEmbed ?? null,
      embedding_trace: buildEmbeddingTrace(mode, embed.traces, embed.total_latency_ms, embed.final_norm, embed.fused),
      pipeline_trace: {
        style_node_id: styleNodeId,
        style_node_match_brands: styleNodeMatchBrands,
        target_family: targetFamily,
        family_match_products: familyMatchProducts,
      },
      rpc: {latency_ms: rpcLatency, ok: false},
    })
  }

  const rawRows = (rpcData ?? []) as V6Row[]
  const rows = diversifySearchResults(
    rawRows.filter((row) => isHttpImageUrl(row.image_url)),
    limit
  )

  // ── 5) augment: brand_node + embedded_at + category/family per row ──
  // RPC 는 p.subcategory 만 리턴 (project-wide NULL). 우리가 category/gender 를
  // products 에서, color 를 product_features(VLM primary_color) 에서 fetch 해
  // augment row 를 채운다. products.material 은 migration 079 에서 드롭됐고
  // products.color 는 product_features 로 이관됐다 (2026-07-29).
  const productIds = rows.map((r) => r.id)
  const brandsRaw = Array.from(new Set(rows.map((r) => r.brand)))
  const brandsLower = Array.from(new Set(rows.map((r) => r.brand.toLowerCase())))

  const [embRes, productMetaRes, featureRes, brandsByNameRes, brandsByNormalizedRes] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("product_embeddings")
          .select("product_id, embedded_at")
          .in("product_id", productIds)
      : Promise.resolve({data: []}),
    productIds.length > 0
      ? supabase
          .from("products")
          .select("id, category, gender, original_price, sale_price")
          .in("id", productIds)
      : Promise.resolve({data: []}),
    productIds.length > 0
      ? supabase
          .from("product_features")
          .select("product_id, feature_metadata")
          .in("product_id", productIds)
      : Promise.resolve({data: []}),
    // 1차: brand_nodes.brand_name 가 products.brand 와 byte-identical
    brandsRaw.length > 0
      ? supabase
          .from("brand_nodes")
          .select(
            "brand_name, brand_name_normalized, primary_style_node_id, " +
              "style_nodes!brand_nodes_primary_style_node_id_fkey(code, name_en)"
          )
          .in("brand_name", brandsRaw)
      : Promise.resolve({data: []}),
    // 2차: brand_name_normalized (lower-case 가정) 매칭 — 1차에서 못 잡은 case 변형
    brandsLower.length > 0
      ? supabase
          .from("brand_nodes")
          .select(
            "brand_name, brand_name_normalized, primary_style_node_id, " +
              "style_nodes!brand_nodes_primary_style_node_id_fkey(code, name_en)"
          )
          .in("brand_name_normalized", brandsLower)
      : Promise.resolve({data: []}),
  ])

  const embeddedAtMap = new Map<number, string>()
  for (const e of (embRes.data ?? []) as Array<{product_id: number; embedded_at: string}>) {
    embeddedAtMap.set(e.product_id, e.embedded_at)
  }

  type ProductMeta = {
    id: number
    category: string | null
    gender: string[] | null
    original_price: number | null
    sale_price: number | null
  }
  const productMetaMap = new Map<number, ProductMeta>()
  for (const p of (productMetaRes.data ?? []) as ProductMeta[]) {
    productMetaMap.set(p.id, p)
  }

  // VLM color — 검색 RPC 의 p_color_family 가 보는 것과 동일한 값이어야
  // 디버거가 필터 결과를 설명할 수 있다.
  const colorMap = new Map<number, string | null>()
  for (const f of (featureRes.data ?? []) as Array<{
    product_id: number
    feature_metadata: Record<string, unknown> | null
  }>) {
    colorMap.set(f.product_id, (f.feature_metadata?.primary_color as string | undefined) ?? null)
  }

  // category(raw) → family lookup (verbatim 매칭 — migration 082 fix)
  const rawCategories = Array.from(
    new Set(
      Array.from(productMetaMap.values())
        .map((p) => p.category)
        .filter((v): v is string => !!v)
    )
  )
  const rawToFamily = new Map<string, string>()
  if (rawCategories.length > 0) {
    const {data: ccRows} = await supabase
      .from("category_canonical")
      .select("raw_category, family")
      .in("raw_category", rawCategories)
    for (const c of (ccRows ?? []) as Array<{raw_category: string; family: string}>) {
      rawToFamily.set(c.raw_category, c.family)
    }
  }

  const brandStyleMap = new Map<
    string,
    {primary_code: string | null; primary_name: string | null}
  >()
  const mergeBrands = [
    ...((brandsByNameRes.data ?? []) as unknown as Array<{
      brand_name: string
      brand_name_normalized: string | null
      style_nodes: {code: string; name_en: string} | {code: string; name_en: string}[] | null
    }>),
    ...((brandsByNormalizedRes.data ?? []) as unknown as Array<{
      brand_name: string
      brand_name_normalized: string | null
      style_nodes: {code: string; name_en: string} | {code: string; name_en: string}[] | null
    }>),
  ]
  for (const b of mergeBrands) {
    const sn = Array.isArray(b.style_nodes) ? b.style_nodes[0] : b.style_nodes
    const entry = {
      primary_code: sn?.code ?? null,
      primary_name: sn?.name_en ?? null,
    }
    if (b.brand_name) brandStyleMap.set(b.brand_name.toLowerCase(), entry)
    if (b.brand_name_normalized)
      brandStyleMap.set(b.brand_name_normalized.toLowerCase(), entry)
  }

  const augmentedResults = rows.map((r, idx) => {
    const meta = productMetaMap.get(r.id)
    const family = meta?.category ? rawToFamily.get(meta.category) ?? null : null
    const brandStyle = brandStyleMap.get(r.brand.toLowerCase()) ?? null
    return {
      rank: idx + 1,
      id: r.id,
      brand: r.brand,
      name: r.name,
      price: r.price,
      image_url: r.image_url,
      product_url: r.product_url,
      platform: r.platform,
      // category 는 우리가 fetch 한 raw, subcategory 는 RPC 리턴 (대부분 null)
      category: meta?.category ?? null,
      subcategory: r.subcategory,
      color: colorMap.get(r.id) ?? null,
      gender: meta?.gender ?? null,
      original_price: meta?.original_price ?? null,
      sale_price: meta?.sale_price ?? null,
      distance: r.distance,
      degraded: r.degraded,
      embedded_at: embeddedAtMap.get(r.id) ?? null,
      brand_style: brandStyle,
      family,
      style_node_match:
        styleNodeId != null && brandStyle?.primary_code === body.style_node_code,
      family_match: targetFamily != null && family === targetFamily,
    }
  })

  return NextResponse.json({
    stage: "ok",
    rewrite_trace: rewriteResult,
    vision_trace: visionResult,
    text_used_for_embed: textForEmbed ?? null,
    embedding_trace: buildEmbeddingTrace(mode, embed.traces, embed.total_latency_ms, embed.final_norm, embed.fused),
    pipeline_trace: {
      style_node_code: body.style_node_code ?? null,
      style_node_id: styleNodeId,
      style_node_match_brands: styleNodeMatchBrands,
      style_node_lookup_ms: styleNodeLookupLatency,
      raw_category: effectiveCategory,
      category_source: body.category?.trim()
        ? "manual"
        : autoWiredCategory
          ? "vision"
          : "none",
      target_family: targetFamily,
      family_match_products: familyMatchProducts,
      family_lookup_ms: familyLookupLatency,
      degraded: rows.length > 0 ? rows[0].degraded : null,
    },
    rpc: {
      latency_ms: rpcLatency,
      returned: rows.length,
      limit,
      candidate_count: rawRows.length,
      brand_cap: SEARCH_DEBUG_BRAND_CAP,
    },
    results: augmentedResults,
  })
}

function buildEmbeddingTrace(
  mode: EmbedMode,
  traces: ModalEmbedTrace[],
  totalMs: number,
  finalNorm: number | undefined,
  fused: boolean
) {
  return {
    mode,
    fused,
    total_latency_ms: totalMs,
    final_norm: finalNorm ?? null,
    modal_calls: traces,
  }
}
