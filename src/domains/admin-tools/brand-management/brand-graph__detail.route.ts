import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

// 본 라우트는 옛 /admin/brand-graph 페이지(폐기)와 새 /admin/brand-nodes drawer
// 둘 다 사용했으나, 067 migration 으로 brand_nodes 슬림화 후 새 drawer 전용.
// 향후 /api/admin/brand-nodes/[id]/route.ts 로 이전 예정.

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({error: "missing id"}, {status: 400})

  // 1) brand_nodes — 슬림화된 컬럼만
  type BrandRow = {
    id: number
    brand_name: string
    description: string | null
    attributes: Record<string, string[]> | null
    wiki: Record<string, unknown> | null
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | string | null
    style_node_assigned_model: string | null
    style_node_assigned_at: string | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | string | null
    price_max_usd: number | string | null
  }
  const {data: brandRaw, error: bErr} = await supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, description, attributes, wiki, " +
        "primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, style_node_assigned_model, style_node_assigned_at, " +
        "gender_scope, source_platforms, price_min_usd, price_max_usd",
    )
    .eq("id", id)
    .single()
  if (bErr || !brandRaw) {
    return NextResponse.json({error: "not found"}, {status: 404})
  }
  const brand = brandRaw as unknown as BrandRow

  // 2) style_nodes JOIN — primary / secondary
  const nodeIds: number[] = []
  if (brand.primary_style_node_id != null) nodeIds.push(brand.primary_style_node_id)
  if (brand.secondary_style_node_id != null && brand.secondary_style_node_id !== brand.primary_style_node_id) {
    nodeIds.push(brand.secondary_style_node_id)
  }
  type NodeRow = {id: number; code: string; name_en: string}
  const nodeMap = new Map<number, NodeRow>()
  if (nodeIds.length > 0) {
    const {data: nodes} = await supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .in("id", nodeIds)
    for (const n of (nodes ?? []) as NodeRow[]) nodeMap.set(n.id, n)
  }

  // 3) products — samples + stats
  type ProductRow = {
    id: string
    name: string | null
    image_url: string | null
    images: string[] | null
    original_price: number | null
    sale_price: number | null
    source_price: number | null
    source_currency: string | null
    category: string | null
    product_url: string | null
    in_stock: boolean | null
    is_brand_representative: boolean | null
  }
  const {data: products} = await supabase
    .from("products")
    .select(
      "id, name, image_url, images, original_price, sale_price, source_price, source_currency, " +
        "category, product_url, in_stock, is_brand_representative",
    )
    .eq("brand_node_id", id)
    .limit(2000)

  const all = (products ?? []) as unknown as ProductRow[]
  const skuCount = all.length
  const inStockCount = all.filter((p) => p.in_stock).length

  // samples: representative 우선 → 다양한 카테고리
  const repSamples = all.filter((p) => p.is_brand_representative).slice(0, 10)
  const samples: ProductRow[] = [...repSamples]
  if (samples.length < 10) {
    const seen = new Set(samples.map((s) => s.id))
    for (const p of all) {
      if (samples.length >= 10) break
      if (seen.has(p.id)) continue
      const img = p.image_url ?? p.images?.[0]
      if (!img) continue
      samples.push(p)
      seen.add(p.id)
    }
  }

  // 4) similar brand — FashionSigLIP multimodal cosine (mig 065 RPC)
  //   brand_multimodal_embeddings.vector 기반. brand-clusters 패널과 동일 RPC.
  type SimRow = {brand_id: number; brand_name: string; primary_style_node_id: number | null; similarity: number | string}
  const {data: simRows} = await supabase.rpc("find_similar_brands", {
    p_brand_id: Number(id),
    p_limit: 10,
  })
  const simList = (simRows ?? []) as SimRow[]
  const similarResult: Array<{id: number; name: string; primary_style_node_id: number | null; similarity: number}> =
    simList.map((r) => ({
      id: r.brand_id,
      name: r.brand_name,
      primary_style_node_id: r.primary_style_node_id,
      similarity: Number(r.similarity),
    }))

  // similar 의 primary_style_node 까지 한 번에 lookup (node 배지 표시용)
  const similarNodeIds = simList
    .map((s) => s.primary_style_node_id)
    .filter((v): v is number => v != null && !nodeMap.has(v))
  if (similarNodeIds.length > 0) {
    const {data: extraNodes} = await supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .in("id", similarNodeIds)
    for (const n of (extraNodes ?? []) as NodeRow[]) nodeMap.set(n.id, n)
  }
  const nodesById: Record<number, {code: string; name_en: string}> = {}
  for (const [k, v] of nodeMap.entries()) nodesById[k] = {code: v.code, name_en: v.name_en}

  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.brand_name,
      description: brand.description,
      attributes: brand.attributes,
      wiki: brand.wiki,
      primary_style_node:
        brand.primary_style_node_id != null ? nodeMap.get(brand.primary_style_node_id) ?? null : null,
      secondary_style_node:
        brand.secondary_style_node_id != null ? nodeMap.get(brand.secondary_style_node_id) ?? null : null,
      confidence: brand.style_node_confidence != null ? Number(brand.style_node_confidence) : null,
      classify_model: brand.style_node_assigned_model,
      classified_at: brand.style_node_assigned_at,
      gender_scope: brand.gender_scope,
      source_platforms: brand.source_platforms,
      price_min_usd: brand.price_min_usd != null ? Number(brand.price_min_usd) : null,
      price_max_usd: brand.price_max_usd != null ? Number(brand.price_max_usd) : null,
    },
    stats: {product_count: skuCount, in_stock_count: inStockCount},
    samples: samples.map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? p.images?.[0] ?? null,
      sale_price: p.sale_price,
      source_price: p.source_price,
      source_currency: p.source_currency,
      category: p.category,
      product_url: p.product_url,
    })),
    similar: similarResult,
    nodes_by_id: nodesById,
  })
}
