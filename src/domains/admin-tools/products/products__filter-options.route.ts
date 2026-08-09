import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

// SPEC-SEARCH-V6-001 P2: PAI 폐기 후 어드민 상품 필터 옵션.
// 옛 RPC get_product_filter_counts() 는 product_ai_analysis 참조로 깨졌으며
// migration 074 에서 DROP. 이 라우트는 products + style_nodes 직접 집계.
//
// v6 변경:
//   * categories: products.category 분포
//   * platforms : products.platform 분포
//   * styleNodes: style_nodes.code (활성) — brand-level 분류 경유 필터
//   * 폐기: subcategories / colorFamilies / fits / fabrics (PAI 의존)

export const revalidate = 600

export interface FilterOptionsResponse {
  platforms: {value: string; count: number}[]
  categories: {value: string; count: number}[]
  subcategories: {value: string; count: number}[]
  styleNodes: {value: string; label: string}[]
}

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const [platformsRes, categoriesRes, subcategoriesRes, styleNodesRes] = await Promise.all([
    supabase.rpc("count_products_by", {p_column: "platform"}).then((r) =>
      r.error ? null : (r.data as Array<{value: string; count: number}>)
    ),
    supabase.rpc("count_products_by", {p_column: "category"}).then((r) =>
      r.error ? null : (r.data as Array<{value: string; count: number}>)
    ),
    supabase.rpc("count_products_by", {p_column: "subcategory"}).then((r) =>
      r.error ? null : (r.data as Array<{value: string; count: number}>)
    ),
    supabase
      .from("style_nodes")
      .select("code, name_en")
      .eq("is_active", true)
      .order("code"),
  ])

  // RPC 가 없으면 fallback (그룹바이를 클라이언트에서) — 데이터량 많을 수 있으나 1회 캐시
  const platforms =
    platformsRes ?? (await groupByFallback("platform"))
  const categories =
    categoriesRes ?? (await groupByFallback("category"))
  // count_products_by RPC 는 platform/category 만 지원 → subcategory 는 빈 배열 반환.
  // 빈 배열도 fallback 을 타도록 length 로 판정 (?? 는 빈 배열에 안 걸림).
  const subcategories =
    subcategoriesRes && subcategoriesRes.length > 0
      ? subcategoriesRes
      : await groupByFallback("subcategory")

  const styleNodes = ((styleNodesRes.data ?? []) as Array<{code: string; name_en: string}>).map(
    (r) => ({value: r.code, label: `${r.code} · ${r.name_en}`})
  )

  const response: FilterOptionsResponse = {
    platforms: sortByCountDesc(platforms),
    categories: sortByCountDesc(categories),
    subcategories: sortByCountDesc(subcategories),
    styleNodes,
  }

  return NextResponse.json(response, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
    },
  })
}

function sortByCountDesc(rows: Array<{value: string; count: number}>) {
  return [...rows]
    .filter((r) => r.value != null && r.value !== "")
    .sort((a, b) => Number(b.count) - Number(a.count))
    .map((r) => ({value: r.value, count: Number(r.count)}))
}

// RPC 미존재 환경(또는 신규 migration 074 미적용) fallback.
// products 전수 fetch 후 클라이언트 그룹바이 — 11만 row 정도라 1회 캐시 acceptable.
async function groupByFallback(column: "platform" | "category" | "subcategory") {
  const {data} = await supabase.from("products").select(column).limit(200000)
  const counter = new Map<string, number>()
  for (const row of (data ?? []) as Array<Record<string, string | null>>) {
    const v = row[column]
    if (!v) continue
    counter.set(v, (counter.get(v) ?? 0) + 1)
  }
  return Array.from(counter.entries()).map(([value, count]) => ({value, count}))
}
