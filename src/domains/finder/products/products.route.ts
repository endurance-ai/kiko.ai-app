import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {KOREAN_VOCAB} from "@/shared/enums/korean-vocab"

// 공개 크리에이터용 상품 탐색 API — admin-tools/products/products.route.ts 를
// 읽기 전용 축소 복제한 것.
//
// 어드민판 대비 제거된 것: requireApprovedAdmin 게이트, embeddingStatus/featureStatus
// (product_embeddings·product_features 조회 자체를 하지 않음), platform 필터,
// reviewStatus 필터, stockStatus 필터 UI(대신 in_stock=true 를 항상 강제).
// 응답에도 내부 식별자(brandNodeId)·타임스탬프·리뷰수·임베딩/VLM 상태를 넣지 않는다.
//
// 유지: 검색(한국어 확장), 카테고리/서브카테고리, 성별, 스타일 노드, 가격대, 정렬.
// 신규: product_url 을 select·응답에 포함 (카드 클릭 시 외부 자사몰로 이동).

const PAGE_SIZE = 60

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
  const {searchParams} = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const sanitize = (s: string) => s.replace(/[.,()\\]/g, "")
  const search = sanitize(searchParams.get("search")?.trim() || "")
  const category = searchParams.get("category") || ""
  const subcategory = searchParams.get("subcategory") || ""
  const brand = sanitize(searchParams.get("brand") || "")
  const styleNodeCode = searchParams.get("styleNode") || ""
  // 성별 다중선택: 콤마 구분(예: "men,unisex"). 선택된 값들과 products.gender 가 겹치면 통과.
  const genders = (searchParams.get("gender") || "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g === "men" || g === "women" || g === "unisex")
  const priceMinRaw = parseInt(searchParams.get("priceMin") || "", 10)
  const priceMin = Number.isNaN(priceMinRaw) || priceMinRaw < 0 ? null : priceMinRaw
  const priceMaxRaw = parseInt(searchParams.get("priceMax") || "", 10)
  const priceMax = Number.isNaN(priceMaxRaw) || priceMaxRaw < 0 ? null : priceMaxRaw
  const sort = searchParams.get("sort") || "newest"

  let orderCol = "first_seen_at" // dev #97 에서 created_at → first_seen_at rename
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

  let query = supabase
    .from("products")
    .select(
      "id, brand, brand_node_id, name, price, source_currency, source_price, image_url, category, product_url",
      {count: "exact"}
    )
    // 공개 페이지: 품절 상품은 항상 숨김 (재고 필터 UI 는 없고 이 조건만 고정).
    .eq("in_stock", true)

  if (brandIdAllowList) query = query.in("brand_node_id", brandIdAllowList)
  // 서브카테고리는 products.subcategory 직접 컬럼(백필됨) 으로 필터
  if (subcategory) query = query.eq("subcategory", subcategory)
  if (search) {
    const terms = expandSearchTerms(search)
    const ors = terms.flatMap((t) => {
      const s = t.replace(/[%,()]/g, "")
      return [`brand.ilike.%${s}%`, `name.ilike.%${s}%`]
    })
    if (ors.length > 0) query = query.or(ors.join(","))
  }
  if (category) query = query.eq("category", category)
  if (brand) query = query.ilike("brand", `%${brand}%`)
  if (genders.length > 0) query = query.overlaps("gender", genders)
  if (priceMin != null) query = query.gte("price", priceMin)
  if (priceMax != null) query = query.lte("price", priceMax)

  query = query.order(orderCol, {ascending: orderAsc, nullsFirst: false})
  query = query.order("id", {ascending: false})

  const from = page * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const {data, count, error} = await query
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  type ProductRow = {
    id: number; brand: string; brand_node_id: number | null; name: string;
    price: number | null; source_currency: string | null; source_price: number | null;
    image_url: string | null; category: string | null; product_url: string | null;
  }

  const rows = (data ?? []) as ProductRow[]
  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // 페이지 상품들의 brand_node → style_node 매핑 batch-fetch (brand_node_id 자체는 응답에 넣지 않음)
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

  const result = rows.map((p) => {
    const style = p.brand_node_id != null ? styleByBrandNode.get(p.brand_node_id) ?? null : null
    return {
      id: String(p.id),
      brand: p.brand,
      name: p.name,
      price: p.price,
      sourceCurrency: p.source_currency,
      sourcePrice: p.source_price,
      imageUrl: p.image_url,
      category: p.category,
      productUrl: p.product_url,
      styleNode: style ? {code: style.code, name_en: style.name_en} : null,
    }
  })

  return NextResponse.json({products: result, total: totalCount, page, totalPages})
}
