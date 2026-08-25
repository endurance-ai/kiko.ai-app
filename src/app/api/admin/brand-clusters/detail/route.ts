import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/brand-clusters/detail?id={brand_id}
 *
 * 어드민 /admin/brand-clusters 페이지의 brand 클릭 시 호출.
 * 현재 스키마 (mig 067 후 슬림) 기준 — sensitivity_tags/brand_keywords/aliases 등 없음.
 *
 * Response shape:
 *   brand          : id, name, primary/secondary node id, attributes (13키), gender_scope, source_platforms, price_min_usd, price_max_usd
 *   cluster        : { id, computed_at }   // brand_multimodal_umap
 *   stats          : sku_count, rep_count, embedded
 *   rep_images     : products[is_brand_representative=true] 최대 10장 (임베딩에 사용된 것과 동일)
 *   prices         : min/median/max from products (USD 환산 안 함 — source 그대로)
 *   categories     : top 5
 *   similar        : find_similar_brands(brand_id, 10) RPC 결과
 */

type BrandDetail = {
  brand: {
    id: number
    name: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | null
    attributes: Record<string, unknown> | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | null
    price_max_usd: number | null
  }
  cluster: {
    id: number | null
    computed_at: string | null
  }
  stats: {
    sku_count: number
    rep_count: number
  }
  rep_images: Array<{
    product_id: string | number
    name: string | null
    image_url: string
    product_url: string | null
    color: string | null
    category: string | null
  }>
  prices: {
    min: number | null
    median: number | null
    max: number | null
    count: number
    currency: string | null
  }
  categories: Array<{label: string; count: number}>
  similar: Array<{
    brand_id: number
    brand_name: string
    primary_style_node_id: number | null
    similarity: number
  }>
  nodes_by_id: Record<number, {code: string; name_en: string}>
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const idStr = request.nextUrl.searchParams.get("id")
  if (!idStr) return NextResponse.json({error: "missing id"}, {status: 400})
  const brandId = Number.parseInt(idStr, 10)
  if (!Number.isInteger(brandId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  // 1. brand_nodes
  const {data: brand, error: bErr} = await supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, primary_style_node_id, secondary_style_node_id, style_node_confidence, attributes, gender_scope, source_platforms, price_min_usd, price_max_usd",
    )
    .eq("id", brandId)
    .maybeSingle()
  if (bErr) return NextResponse.json({error: bErr.message}, {status: 500})
  if (!brand) return NextResponse.json({error: "not found"}, {status: 404})

  // 2. cluster from umap
  const {data: umapRow} = await supabase
    .from("brand_multimodal_umap")
    .select("cluster_id, cluster_computed_at")
    .eq("brand_id", brandId)
    .maybeSingle()

  // 3. products (sku 집계 + 가격 + 카테고리)
  const {data: allProducts} = await supabase
    .from("products")
    .select(
      "id, name, image_url, product_url, source_price, source_currency, is_brand_representative, category",
    )
    .eq("brand_node_id", brandId)
    .limit(2000)

  const products = allProducts ?? []
  const repProducts = products
    .filter((p) => p.is_brand_representative && p.image_url)
    .sort((a, b) => {
      const ai = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0
      const bi = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0
      return ai - bi
    })
    .slice(0, 10)

  const repColorByProductId = new Map<string, string>()
  if (repProducts.length) {
    const {data: featureRows} = await supabase
      .from("product_features")
      .select("product_id, feature_metadata")
      .in("product_id", repProducts.map((p) => p.id))

    for (const row of featureRows ?? []) {
      const metadata = row.feature_metadata as Record<string, unknown> | null
      const primaryColor = metadata?.primary_color
      if (typeof primaryColor === "string" && primaryColor) {
        repColorByProductId.set(String(row.product_id), primaryColor)
      }
    }
  }

  // 4. rep_images (임베딩과 동일한 source — id ASC 10장)
  const repImages = repProducts.map((p) => ({
      product_id: p.id,
      name: p.name ?? null,
      image_url: p.image_url as string,
      product_url: p.product_url ?? null,
      color: repColorByProductId.get(String(p.id)) ?? null,
      category: p.category ?? null,
    }))

  // 5. price stats (source 통화 그대로 — brand 내 mixed currency 가정 없음)
  const prices = products
    .map((p) => p.source_price)
    .filter((v): v is number => typeof v === "number" && v > 0)
  const currency = products.find((p) => p.source_currency)?.source_currency ?? null
  const priceStats = {
    min: prices.length ? Math.min(...prices) : null,
    median: median(prices),
    max: prices.length ? Math.max(...prices) : null,
    count: prices.length,
    currency,
  }

  // 6. 카테고리 top 5
  const catCounts = new Map<string, number>()
  for (const p of products) {
    const label = (p.category ?? "").toString().trim() || "(미분류)"
    catCounts.set(label, (catCounts.get(label) ?? 0) + 1)
  }
  const categories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({label, count}))

  // 7. similar — find_similar_brands RPC
  const {data: simRows} = await supabase.rpc("find_similar_brands", {
    p_brand_id: brandId,
    p_limit: 10,
  })
  const similar = (simRows ?? []).map((r: {brand_id: number; brand_name: string; primary_style_node_id: number | null; similarity: number}) => ({
    brand_id: r.brand_id,
    brand_name: r.brand_name,
    primary_style_node_id: r.primary_style_node_id,
    similarity: Number(r.similarity),
  }))

  // 8. style_nodes lookup (이름 표시용)
  const nodeIds = new Set<number>()
  if (brand.primary_style_node_id != null) nodeIds.add(brand.primary_style_node_id)
  if (brand.secondary_style_node_id != null) nodeIds.add(brand.secondary_style_node_id)
  for (const s of similar) {
    if (s.primary_style_node_id != null) nodeIds.add(s.primary_style_node_id)
  }
  const nodesById: Record<number, {code: string; name_en: string}> = {}
  if (nodeIds.size > 0) {
    const {data: nodes} = await supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .in("id", [...nodeIds])
    for (const n of nodes ?? []) {
      nodesById[n.id] = {code: n.code, name_en: n.name_en}
    }
  }

  const result: BrandDetail = {
    brand: {
      id: brand.id,
      name: brand.brand_name,
      primary_style_node_id: brand.primary_style_node_id,
      secondary_style_node_id: brand.secondary_style_node_id,
      style_node_confidence: brand.style_node_confidence,
      attributes: brand.attributes,
      gender_scope: brand.gender_scope,
      source_platforms: brand.source_platforms,
      price_min_usd: brand.price_min_usd,
      price_max_usd: brand.price_max_usd,
    },
    cluster: {
      id: umapRow?.cluster_id ?? null,
      computed_at: umapRow?.cluster_computed_at ?? null,
    },
    stats: {
      sku_count: products.length,
      rep_count: repProducts.length,
    },
    rep_images: repImages,
    prices: priceStats,
    categories,
    similar,
    nodes_by_id: nodesById,
  }
  return NextResponse.json(result)
}
