import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

// SPEC-SEARCH-V6-001 P2: PAI 폐기 후 어드민 상품 상세.
// AI categorical 분석 (color/fit/fabric/mood/keywords) 은 v6 에서 임베딩이 대체.
// 응답은 products row + brand→style_node 매핑 + product_embeddings 보유여부만.

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await params

  const {data: product, error: productError} = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single()

  if (productError || !product) {
    return NextResponse.json({error: "Product not found"}, {status: 404})
  }

  const [styleRes, embRes, featRes] = await Promise.all([
    product.brand_node_id != null
      ? supabase
          .from("brand_nodes")
          .select("id, style_nodes!brand_nodes_primary_style_node_id_fkey(code, name_en)")
          .eq("id", product.brand_node_id)
          .maybeSingle()
      : Promise.resolve({data: null, error: null}),
    supabase
      .from("product_embeddings")
      .select("product_id, embedded_at")
      .eq("product_id", id)
      .maybeSingle(),
    // 2026-07-29: color 는 VLM(product_features.primary_color) 이 단일 출처.
    supabase
      .from("product_features")
      .select("feature_metadata")
      .eq("product_id", id)
      .maybeSingle(),
  ])

  const styleNode =
    (styleRes.data as {style_nodes: {code: string; name_en: string} | null} | null)
      ?.style_nodes ?? null

  const featureMetadata =
    (featRes.data as {feature_metadata: Record<string, unknown>} | null)?.feature_metadata ?? null
  const color = (featureMetadata?.primary_color as string | undefined) ?? null

  return NextResponse.json({
    product: {
      id: product.id,
      brand: product.brand,
      name: product.name,
      price: product.price,
      originalPrice: product.original_price,
      salePrice: product.sale_price,
      imageUrl: product.image_url,
      images: product.images,
      productUrl: product.product_url,
      platform: product.platform,
      category: product.category,
      subcategory: product.subcategory,
      gender: product.gender,
      inStock: product.in_stock,
      color,
      featureMetadata,
      tags: product.tags,
      sizeInfo: product.size_info,
      createdAt: product.created_at,
      styleNode,
      hasEmbedding: !!embRes.data,
      embeddedAt: (embRes.data as {embedded_at?: string} | null)?.embedded_at ?? null,
    },
  })
}
