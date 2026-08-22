import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {KOREAN_VOCAB} from "@/shared/enums/korean-vocab"

// SPEC-SEARCH-V6-001 P2: product_ai_analysis (PAI) 폐기 후 어드민 상품 목록.
// v6 에서 product-level 스타일/색/핏 categorical 라벨은 임베딩이 대체.
// 어드민 필터는 products 컬럼 + brand_nodes.primary_style_node_id + product_embeddings 만 사용.

const DEFAULT_PAGE_SIZE = 60
const CURATION_PAGE_SIZE = 24

function expandSearchTerms(raw: string): string[] {
  const term = raw.trim().toLowerCase()
  if (!term) return []
  const out = new Set<string>([raw.trim()])
  for (const [key, entry] of Object.entries(KOREAN_VOCAB)) {
    const bag = [key.toLowerCase(), entry.subcategory.toLowerCase(), ...entry.keywords.map((k) => k.toLowerCase())]
    if (bag.some((k) => k.includes(term) || term.includes(k))) {
      for (const kw of entry.keywords) out.add(kw)
    }
  }
  return Array.from(out).filter((t) => t.length >= 2).slice(0, 12)
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {searchParams} = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const sanitize = (s: string) => s.replace(/[.,()\\]/g, "")
  const search = sanitize(searchParams.get("search")?.trim() || "")
  const mode = searchParams.get("mode") || ""
  const isCurationMode = mode === "curation"
  const pageSize = isCurationMode ? CURATION_PAGE_SIZE : DEFAULT_PAGE_SIZE
  const category = searchParams.get("category") || ""
  const subcategory = searchParams.get("subcategory") || ""
  const platform = searchParams.get("platform") || ""
  const brand = sanitize(searchParams.get("brand") || "")
  const styleNodeCode = searchParams.get("styleNode") || ""
  // 성별 다중선택: 콤마 구분(예: "men,unisex"). 선택된 값들과 products.gender 가 겹치면 통과.
  const genders = (searchParams.get("gender") || "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g === "men" || g === "women" || g === "unisex")
  const effectiveGenders =
    isCurationMode && genders.length === 1 && genders[0] !== "unisex"
      ? [genders[0], "unisex"]
      : genders
  const embeddingStatus = searchParams.get("embeddingStatus") || "all" // all | embedded | no_embedding
  const stockStatus = searchParams.get("stockStatus") || "all"
  // 2026-07-29: products.description 제거 → "상세 유무" 필터가 의미를 잃었다.
  // VLM 분석(product_features) 보유 여부로 재정의 (all | with_features | no_features).
  const featureStatus = searchParams.get("featureStatus") || "all"
  const reviewStatus = searchParams.get("reviewStatus") || "all"
  const sort = searchParams.get("sort") || "newest"

  let orderCol = "first_seen_at"
  let orderAsc = false
  switch (sort) {
    case "price_asc": orderCol = "price"; orderAsc = true; break
    case "price_desc": orderCol = "price"; orderAsc = false; break
    case "brand_asc": orderCol = "brand"; orderAsc = true; break
  }

  // styleNode 필터: 브랜드 레벨 분류 경유 (code → style_nodes.id → brand_nodes.primary → brand_ids)
  let brandIdAllowList: number[] | null = null
  if (styleNodeCode) {
    const {data: styleRow, error: styleErr} = await supabase
      .from("style_nodes")
      .select("id")
      .eq("code", styleNodeCode)
      .maybeSingle()
    if (styleErr) return NextResponse.json({error: styleErr.message}, {status: 500})
    if (!styleRow) {
      return NextResponse.json({products: [], total: 0, page, totalPages: 0})
    }
    const {data: brandRows, error: brandErr} = await supabase
      .from("brand_nodes")
      .select("id")
      .eq("primary_style_node_id", styleRow.id)
    if (brandErr) return NextResponse.json({error: brandErr.message}, {status: 500})
    brandIdAllowList = (brandRows ?? []).map((r) => r.id as number)
    if (brandIdAllowList.length === 0) {
      return NextResponse.json({products: [], total: 0, page, totalPages: 0})
    }
  }

  const productColumns =
    "id, brand, brand_node_id, name, price, source_currency, source_price, image_url, platform, category, in_stock, gender, first_seen_at, review_count"
  const productsTable = supabase.from("products")
  let query = isCurationMode
    ? productsTable.select(productColumns)
    : productsTable.select(productColumns, {count: "exact"})

  if (brandIdAllowList) query = query.in("brand_node_id", brandIdAllowList)
  if (isCurationMode) {
    query = query
      .eq("in_stock", true)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .gte("price", 5000)
  }
  // 서브카테고리는 products.subcategory 직접 컬럼(백필됨, ~11만) 으로 필터
  if (subcategory) query = query.eq("subcategory", subcategory)
  if (stockStatus === "in_stock") query = query.eq("in_stock", true)
  else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)
  if (search) {
    if (/^\d+$/.test(search)) {
      query = query.eq("id", Number(search))
    } else {
      const terms = expandSearchTerms(search)
      const ors = terms.flatMap((t) => {
        const s = t.replace(/[%,()]/g, "")
        return [`brand.ilike.%${s}%`, `name.ilike.%${s}%`]
      })
      if (ors.length > 0) query = query.or(ors.join(","))
    }
  }
  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", `%${brand}%`)
  if (effectiveGenders.length > 0) query = query.overlaps("gender", effectiveGenders)
  if (reviewStatus === "with_reviews") query = query.gt("review_count", 0)
  else if (reviewStatus === "no_reviews") query = query.or("review_count.is.null,review_count.eq.0")

  query = query.order(orderCol, {ascending: orderAsc, nullsFirst: false})
  query = query.order("id", {ascending: false})

  // embeddingStatus / featureStatus 필터는 결과 page 에서 post-filter
  // (product_embeddings / product_features 를 PostgREST select 로 JOIN 하기 어렵다)
  const needsEmbeddingFilter = !isCurationMode && embeddingStatus !== "all"
  const needsFeatureFilter = !isCurationMode && featureStatus !== "all"
  if (needsEmbeddingFilter || needsFeatureFilter) {
    query = query.range(0, 1999)
  } else {
    const from = page * pageSize
    // 큐레이션 선택기는 정확한 전체 개수를 세지 않고 다음 페이지 존재 여부만 본다.
    // 한 행을 더 받아 hasMore 를 계산하면 11만 상품 count 와 보강 조회를 피할 수 있다.
    query = query.range(from, from + pageSize - 1 + (isCurationMode ? 1 : 0))
  }

  const {data, count, error} = await query
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  type ProductRow = {
    id: number; brand: string; brand_node_id: number | null; name: string;
    price: number | null; source_currency: string | null; source_price: number | null;
    image_url: string | null; platform: string; category: string | null;
    in_stock: boolean; gender: string[] | null; first_seen_at: string;
    review_count: number | null;
  }

  let rows = (data ?? []) as ProductRow[]
  let totalCount = count ?? 0
  const hasMore = isCurationMode ? rows.length > pageSize : false
  if (isCurationMode && hasMore) rows = rows.slice(0, pageSize)

  // embeddingStatus / featureStatus post-filter — 두 필터가 동시에 걸릴 수 있으므로
  // 둘 다 적용한 뒤에 한 번만 페이지네이션한다 (중복 slice 방지).
  let embeddedSet: Set<number> | null = null
  let featureSet: Set<number> | null = null
  if ((needsEmbeddingFilter || needsFeatureFilter) && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    if (needsEmbeddingFilter) {
      const {data: embRows} = await supabase
        .from("product_embeddings")
        .select("product_id")
        .in("product_id", ids)
      embeddedSet = new Set((embRows ?? []).map((r) => r.product_id as number))
      rows = rows.filter((r) =>
        embeddingStatus === "embedded" ? embeddedSet!.has(r.id) : !embeddedSet!.has(r.id)
      )
    }
    if (needsFeatureFilter) {
      const {data: featRows} = await supabase
        .from("product_features")
        .select("product_id")
        .in("product_id", rows.map((r) => r.id))
      featureSet = new Set((featRows ?? []).map((r) => r.product_id as number))
      rows = rows.filter((r) =>
        featureStatus === "with_features" ? featureSet!.has(r.id) : !featureSet!.has(r.id)
      )
    }
    totalCount = rows.length
    rows = rows.slice(page * pageSize, page * pageSize + pageSize)
  }

  // 페이지 상품들의 brand_node → style_node 매핑 batch-fetch
  const brandNodeIds = isCurationMode
    ? []
    : Array.from(
        new Set(rows.map((r) => r.brand_node_id).filter((v): v is number => v != null))
      )
  const styleByBrandNode = new Map<number, {code: string; name_en: string}>()
  if (brandNodeIds.length > 0) {
    const {data: brandJoin} = await supabase
      .from("brand_nodes")
      .select("id, primary_style_node_id, style_nodes!brand_nodes_primary_style_node_id_fkey(code, name_en)")
      .in("id", brandNodeIds)
    for (const row of (brandJoin ?? []) as unknown as Array<{
      id: number
      primary_style_node_id: number | null
      style_nodes: {code: string; name_en: string} | {code: string; name_en: string}[] | null
    }>) {
      const sn = Array.isArray(row.style_nodes) ? row.style_nodes[0] : row.style_nodes
      if (sn) styleByBrandNode.set(row.id, sn)
    }
  }

  // 페이지 상품의 embedding / VLM feature 보유 여부 (이미 fetch한 경우 재사용)
  if (!isCurationMode && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    if (!embeddedSet) {
      const {data: embRows} = await supabase
        .from("product_embeddings")
        .select("product_id")
        .in("product_id", ids)
      embeddedSet = new Set((embRows ?? []).map((r) => r.product_id as number))
    }
    if (!featureSet) {
      const {data: featRows} = await supabase
        .from("product_features")
        .select("product_id")
        .in("product_id", ids)
      featureSet = new Set((featRows ?? []).map((r) => r.product_id as number))
    }
  }

  const totalPages = isCurationMode ? null : Math.ceil(totalCount / pageSize)

  const result = rows.map((p) => {
    const style = p.brand_node_id != null ? styleByBrandNode.get(p.brand_node_id) ?? null : null
    return {
      id: String(p.id),
      brand: p.brand,
      brandNodeId: p.brand_node_id,
      name: p.name,
      price: p.price,
      sourceCurrency: p.source_currency,
      sourcePrice: p.source_price,
      imageUrl: p.image_url,
      platform: p.platform,
      category: p.category,
      inStock: p.in_stock,
      hasFeatures: featureSet ? featureSet.has(p.id) : false,
      reviewCount: p.review_count ?? 0,
      hasEmbedding: embeddedSet ? embeddedSet.has(p.id) : false,
      styleNode: style ? {code: style.code, name_en: style.name_en} : null,
    }
  })

  const response = NextResponse.json({
    products: result,
    total: isCurationMode ? null : totalCount,
    page,
    pageSize,
    totalPages,
    hasMore: isCurationMode ? hasMore : page + 1 < (totalPages ?? 0),
  })
  if (isCurationMode) {
    response.headers.set("cache-control", "private, max-age=15, stale-while-revalidate=45")
  }
  return response
}
