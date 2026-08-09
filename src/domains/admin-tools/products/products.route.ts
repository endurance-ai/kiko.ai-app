import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

// SPEC-SEARCH-V6-001 P2: product_ai_analysis (PAI) 폐기 후 어드민 상품 목록.
// v6 에서 product-level 스타일/색/핏 categorical 라벨은 임베딩이 대체.
// 어드민 필터는 products 컬럼 + brand_nodes.primary_style_node_id + product_embeddings 만 사용.

const PAGE_SIZE = 60

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {searchParams} = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const sanitize = (s: string) => s.replace(/[.,()\\]/g, "")
  const search = sanitize(searchParams.get("search")?.trim() || "")
  const category = searchParams.get("category") || ""
  const platform = searchParams.get("platform") || ""
  const brand = sanitize(searchParams.get("brand") || "")
  const styleNodeCode = searchParams.get("styleNode") || ""
  const gender = searchParams.get("gender") || ""
  const embeddingStatus = searchParams.get("embeddingStatus") || "all" // all | embedded | no_embedding
  const stockStatus = searchParams.get("stockStatus") || "all"
  // 2026-07-29: products.description 제거 → "상세 유무" 필터가 의미를 잃었다.
  // VLM 분석(product_features) 보유 여부로 재정의 (all | with_features | no_features).
  const featureStatus = searchParams.get("featureStatus") || "all"
  const reviewStatus = searchParams.get("reviewStatus") || "all"
  const sort = searchParams.get("sort") || "newest"

  let orderCol = "created_at"
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

  // 성별 필터는 상품 단위 정확도를 위해 product_features 의 VLM 판정
  // (feature_metadata->>gender)으로 건다. products.gender 는 브랜드 상속 등으로
  // 오염돼 있어(예: 여성 비키니가 unisex/men 으로 태깅) 신뢰도가 낮다. (2026-08-09)
  const genderValues =
    gender === "men"
      ? ["men", "unisex"]
      : gender === "women"
        ? ["women", "unisex"]
        : gender === "unisex"
          ? ["unisex"]
          : null

  const cols =
    "id, brand, brand_node_id, name, price, source_currency, source_price, image_url, platform, category, in_stock, gender, created_at, review_count"

  let query = supabase
    .from("products")
    .select(
      genderValues ? `${cols}, product_features!inner(feature_metadata)` : cols,
      {count: "exact"}
    )

  if (brandIdAllowList) query = query.in("brand_node_id", brandIdAllowList)
  if (stockStatus === "in_stock") query = query.eq("in_stock", true)
  else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)
  if (search) query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%,platform.ilike.%${search}%`)
  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", `%${brand}%`)
  if (genderValues) query = query.in("product_features.feature_metadata->>gender", genderValues)
  if (reviewStatus === "with_reviews") query = query.gt("review_count", 0)
  else if (reviewStatus === "no_reviews") query = query.or("review_count.is.null,review_count.eq.0")

  query = query.order(orderCol, {ascending: orderAsc, nullsFirst: false})
  query = query.order("id", {ascending: false})

  // embeddingStatus / featureStatus 필터는 결과 page 에서 post-filter
  // (product_embeddings / product_features 를 PostgREST select 로 JOIN 하기 어렵다)
  const needsEmbeddingFilter = embeddingStatus !== "all"
  const needsFeatureFilter = featureStatus !== "all"
  if (needsEmbeddingFilter || needsFeatureFilter) {
    query = query.range(0, 1999)
  } else {
    const from = page * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)
  }

  const {data, count, error} = await query
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  type ProductRow = {
    id: number; brand: string; brand_node_id: number | null; name: string;
    price: number | null; source_currency: string | null; source_price: number | null;
    image_url: string | null; platform: string; category: string | null;
    in_stock: boolean; gender: string[] | null; created_at: string;
    review_count: number | null;
  }

  let rows = (data ?? []) as ProductRow[]
  let totalCount = count ?? 0

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
    rows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  }

  // 페이지 상품들의 brand_node → style_node 매핑 batch-fetch
  const brandNodeIds = Array.from(
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
  if (rows.length > 0) {
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

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

  return NextResponse.json({products: result, total: totalCount, page, totalPages})
}
