import {notFound} from "next/navigation"
import {supabase} from "@/lib/supabase"
import {ProductDetail} from "@/components/admin/product-detail"

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{id: string}>
}) {
  const {id} = await params

  const [productRes, reviewsRes, featuresRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single(),
    supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", id)
      .order("created_at", {ascending: false})
      .limit(50),
    supabase
      .from("product_features")
      .select("feature_metadata")
      .eq("product_id", id)
      .maybeSingle(),
  ])

  if (productRes.error) notFound()

  const product = productRes.data

  const [styleRes, embRes] = await Promise.all([
    product.brand_node_id != null
      ? supabase
          .from("brand_nodes")
          .select("id, style_nodes!brand_nodes_primary_style_node_id_fkey(code, name_en)")
          .eq("id", product.brand_node_id)
          .maybeSingle()
      : Promise.resolve({data: null}),
    supabase
      .from("product_embeddings")
      .select("product_id, embedded_at")
      .eq("product_id", id)
      .maybeSingle(),
  ])

  const styleNode =
    (styleRes.data as {style_nodes: {code: string; name_en: string} | null} | null)
      ?.style_nodes ?? null
  const featureMetadata =
    (featuresRes.data as {feature_metadata: Record<string, unknown>} | null)?.feature_metadata ?? null
  const primaryColor = (featureMetadata?.primary_color as string | undefined) ?? null

  return (
    <ProductDetail
      product={product}
      primaryColor={primaryColor}
      styleNode={styleNode}
      hasEmbedding={!!embRes.data}
      embeddedAt={(embRes.data as {embedded_at?: string} | null)?.embedded_at ?? null}
      reviews={reviewsRes.data ?? []}
    />
  )
}
