// 스타일 태그별 상품 수 — 현재 컨텍스트(성별·카테고리·품목·nav 속성)에서 각 gate_tag 가
// 몇 개인지 한 번의 스캔으로 집계. FinderSection 이 0개 필을 흐리게 처리하는 데 사용.
// 10분 메모리 캐시 (태깅이 실시간으로 차오르지만 필 흐림 용도로는 충분한 신선도).

import {NextRequest, NextResponse} from "next/server"
import {pool} from "@/lib/db"

export const dynamic = "force-dynamic"

const CACHE_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; counts: Record<string, number> }>()

const ATTR_KEYS = new Set([
  "leg_shape",
  "skirt_shape",
  "length",
  "sleeve_length",
  "neckline",
  "collar_type",
  "volume",
  "wash",
  "pattern",
])

export async function GET(request: NextRequest) {
  const {searchParams} = request.nextUrl
  const genders = (searchParams.get("gender") || "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g === "men" || g === "women" || g === "unisex")
  const category = searchParams.get("category")?.trim() || ""
  const subcategory = searchParams.get("subcategory")?.trim() || ""
  const navAttrKeyRaw = searchParams.get("navAttrKey")?.trim() || ""
  const navAttrKey = ATTR_KEYS.has(navAttrKeyRaw) ? navAttrKeyRaw : ""
  const navAttrValues = (searchParams.get("navAttrValues") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)

  const where: string[] = ["p.in_stock = true", "p.image_url is not null", "p.price >= 5000"]
  const params: unknown[] = []
  const push = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  if (genders.length > 0) where.push(`p.gender && ${push(genders)}::text[]`)
  if (category) where.push(`p.category = ${push(category)}`)
  if (subcategory) where.push(`p.subcategory = ${push(subcategory)}`)
  if (navAttrKey && navAttrValues.length > 0) {
    const kP = push(navAttrKey)
    const vP = push(navAttrValues)
    where.push(
      `f.attr->>${kP} = any(${vP}::text[]) and not coalesce(f.attr->'low_confidence' ? ${kP}, false)`
    )
  }

  const key = where.join("|") + JSON.stringify(params)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({counts: hit.counts})
  }

  try {
    const {rows} = await pool.query<{tag: string; n: string}>(
      `select unnest(f.gate_tags) as tag, count(*) as n
       from products p join product_features_v26 f on f.product_id = p.id
       where ${where.join(" and ")}
       group by 1`,
      params
    )
    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.tag] = parseInt(r.n, 10)
    cache.set(key, {at: Date.now(), counts})
    return NextResponse.json({counts})
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed"
    return NextResponse.json({error: message}, {status: 500})
  }
}
