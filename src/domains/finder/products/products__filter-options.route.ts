import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"

// 공개 크리에이터용 상품 탐색 — 필터 옵션 API.
// admin-tools/products/products__filter-options.route.ts 를 읽기 전용 축소 복제.
//
// 어드민판 대비 제거: requireApprovedAdmin 게이트, platforms(플랫폼 필터 자체를 없앰).
// 어드민판과 달리 count_products_by RPC(platform/category, in_stock 무관 전수집계)를
// 쓰지 않고 products 를 in_stock=true 로 직접 필터링해 집계한다 — 품절만 있는
// 카테고리가 공개 필터에 뜨는 것을 방지하기 위함.

export const revalidate = 600

export interface FinderFilterOptionsResponse {
  categories: {value: string; count: number}[]
  subcategories: {value: string; count: number; category: string}[]
  styleNodes: {value: string; label: string}[]
}

export async function GET() {
  const [catSub, styleNodesRes] = await Promise.all([
    categorySubcategoryOptions(),
    supabase
      .from("style_nodes")
      .select("code, name_en")
      .eq("is_active", true)
      .order("code"),
  ])

  const styleNodes = ((styleNodesRes.data ?? []) as Array<{code: string; name_en: string}>).map(
    (r) => ({value: r.code, label: `${r.code} · ${r.name_en}`})
  )

  const response: FinderFilterOptionsResponse = {
    categories: catSub.categories,
    subcategories: catSub.subcategories,
    styleNodes,
  }

  return NextResponse.json(response, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
    },
  })
}

// 판매중(in_stock=true) 상품만 대상으로 category / (category, subcategory) 분포를
// 한 번의 fetch 로 같이 집계한다.
async function categorySubcategoryOptions() {
  const {data} = await supabase
    .from("products")
    .select("category, subcategory")
    .eq("in_stock", true)
    .limit(200000)

  const categoryCounts = new Map<string, number>()
  const subcategoryCounts = new Map<string, {value: string; category: string; count: number}>()
  for (const row of (data ?? []) as Array<{category: string | null; subcategory: string | null}>) {
    const cat = row.category
    if (!cat) continue
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
    const sub = row.subcategory
    if (!sub) continue
    const key = `${cat} ${sub}`
    const cur = subcategoryCounts.get(key)
    if (cur) cur.count += 1
    else subcategoryCounts.set(key, {value: sub, category: cat, count: 1})
  }

  const categories = Array.from(categoryCounts.entries())
    .map(([value, count]) => ({value, count}))
    .sort((a, b) => b.count - a.count)
  const subcategories = Array.from(subcategoryCounts.values()).sort((a, b) => b.count - a.count)

  return {categories, subcategories}
}
