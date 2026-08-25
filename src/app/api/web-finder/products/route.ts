import {NextRequest, NextResponse} from "next/server"
import {pool} from "@/lib/db"
import {keymapVariant} from "@/app/(chat)/_lib/kr-en-keymap"

// 웹 랜딩(FinderSection) 전용 상품 탐색 API.
//
// 기존 /api/finder/products (domains/finder, supabase PostgREST) 는 DB_URL/DB_TOKEN 이 필요해
// 로컬/웹랜딩 환경에서 런타임 500 — 그 라우트는 그대로 두고, .env.local 의 DATABASE_URL
// (pg, planner_user 읽기권한) 을 쓰는 @/lib/db pool 로 products 를 직쿼리하는 별도 라우트다.
//
// 파라미터·응답 shape 은 기존 /api/finder/products 계약과 동일 (gender/category/subcategory/
// brand/search/sort/page → {products, total, page, totalPages}). 차이점:
// - search 는 KOREAN_VOCAB 확장 없이 원문 term 의 brand/name ilike OR 만 (웹랜딩 요구 범위)
// - styleNode/priceMin/priceMax 파라미터 없음 (FinderSection 미사용)
// - 고정 게이트: in_stock=true, image_url not null, price >= 5000
// - newest 정렬은 created_at 이 아니라 last_seen_at desc nulls last (정확한 신선도 신호)
// - 가격 정렬은 실제 노출가 coalesce(sale_price, price) 기준
// - sort=shuffle 추가: 무필터 기본 상태의 랜덤 샘플 노출용 (ORDER BY random()).
//   seed 파라미터(정수)가 오면 같은 커넥션에서 setseed() 후 정렬 — 셔플 페이지네이션이
//   페이지 간 중복/누락 없이 안정된다 (클라이언트는 세션당 seed 1개 유지).
// - nodes 파라미터 추가: 스타일 노드 코드(A~U) 콤마 구분. brand_nodes 의
//   primary/secondary_style_node_id 경유로 브랜드 레벨 필터 (스타일 필 실필터화).
// - attrKey/attrValue 파라미터 추가: VLM v2.6 속성 필터 (품목별 속성 칩).
//   product_features_v26.attr 의 화이트리스트 키만 허용, low_confidence 표시 축은 제외.
// - 응답 상품에 salePrice/originalPrice 포함 (카드 할인율 표기용)
//
// SQL 은 전부 파라미터라이즈 — 사용자 입력이 문자열로 SQL 에 섞이는 경로 없음.

const PAGE_SIZE = 60

// 셔플 뷰 total 캐시 — TABLESAMPLE 는 윈도우 카운트가 표본 수라 실제 total 을 따로 세는데,
// 같은 필터 조합은 10분 캐시해 매 요청 count(*) 풀스캔을 피한다.
const TOTAL_CACHE_MS = 10 * 60 * 1000
const totalCache = new Map<string, { at: number; total: number }>()

// v2.6 속성 필터 허용 키. neckline_depth 등 저신뢰 축은 금지 (v2.6 문서 규칙),
// material 은 jsonb 배열이라 이번 범위 제외.
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

interface ProductRow {
  id: string
  brand: string
  name: string
  price: number | null
  sale_price: number | null
  original_price: number | null
  image_url: string | null
  product_url: string | null
  _total: string
}

export async function GET(request: NextRequest) {
  const {searchParams} = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const category = searchParams.get("category")?.trim() || ""
  const subcategory = searchParams.get("subcategory")?.trim() || ""
  const brand = searchParams.get("brand")?.trim() || ""
  const search = searchParams.get("search")?.trim() || ""
  const genders = (searchParams.get("gender") || "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g === "men" || g === "women" || g === "unisex")
  const sort = searchParams.get("sort") || "newest"
  // 스타일 노드 코드: A~U 단일 대문자만 통과 (그 외 값은 무시)
  const nodeCodes = (searchParams.get("nodes") || "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^[A-U]$/.test(c))
  // 셔플 페이지 안정화용 seed — 정수를 setseed 범위(-1..1)로 정규화
  const seedRaw = parseInt(searchParams.get("seed") || "", 10)
  const seed = Number.isNaN(seedRaw) ? null : (Math.abs(seedRaw) % 1_000_000) / 1_000_000
  // v2.6 속성 필터 — 키는 화이트리스트 검증 (단일 선택 UI 에 맞춰 각 1개)
  const attrKeyRaw = searchParams.get("attrKey")?.trim() || ""
  const attrValue = searchParams.get("attrValue")?.trim() || ""
  const attrKey = ATTR_KEYS.has(attrKeyRaw) ? attrKeyRaw : ""
  // nav 레벨 속성 (품목 세분: 반소매/긴소매 티셔츠, 미니/롱스커트) — 값 여러 개 허용
  const navAttrKeyRaw = searchParams.get("navAttrKey")?.trim() || ""
  const navAttrKey = ATTR_KEYS.has(navAttrKeyRaw) ? navAttrKeyRaw : ""
  const navAttrValues = (searchParams.get("navAttrValues") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  // 상품 레벨 스타일 태그 (product_features_v26.gate_tags, GIN 인덱스) — 스타일 필의 정본.
  // 브랜드 노드(nodes) 필터보다 해상도가 높아 이쪽을 우선 사용한다.
  const styleTag = (searchParams.get("tag") || "").trim().slice(0, 40)

  // ilike 패턴 안의 와일드카드 문자만 이스케이프 (파라미터라이즈와 별개로 % _ 의미 무력화)
  const likeTerm = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`

  const where: string[] = ["in_stock = true", "image_url is not null", "price >= 5000"]
  const params: unknown[] = []
  const push = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }

  if (genders.length > 0) where.push(`gender && ${push(genders)}::text[]`)
  if (category) where.push(`category = ${push(category)}`)
  if (subcategory) where.push(`subcategory = ${push(subcategory)}`)
  if (brand) {
    // 한/영 키 전환 오타 변환 후보를 OR 로 함께 조회 ("ㅗ미ㄹ해ㅛ" → halfboy)
    const variant = keymapVariant(brand)
    const p1 = push(likeTerm(brand))
    if (variant) {
      const p2 = push(likeTerm(variant))
      where.push(`(brand ilike ${p1} or brand ilike ${p2})`)
    } else {
      where.push(`brand ilike ${p1}`)
    }
  }
  if (search) {
    const variant = keymapVariant(search)
    const p = push(likeTerm(search))
    if (variant) {
      const p2 = push(likeTerm(variant))
      where.push(`(brand ilike ${p} or name ilike ${p} or brand ilike ${p2} or name ilike ${p2})`)
    } else {
      where.push(`(brand ilike ${p} or name ilike ${p})`)
    }
  }
  if (nodeCodes.length > 0) {
    // 스타일 필 → 브랜드 레벨 분류 경유: style_nodes.code → brand_nodes(primary|secondary) → products.brand_node_id
    where.push(
      `brand_node_id in (
        select bn.id from brand_nodes bn
        join style_nodes sn on sn.id in (bn.primary_style_node_id, bn.secondary_style_node_id)
        where sn.code = any(${push(nodeCodes)}::text[])
      )`
    )
  }
  if ((attrKey && attrValue) || (navAttrKey && navAttrValues.length > 0) || styleTag) {
    // v2.6 속성 필터 — subsub 칩(단일값) + nav 세분(다중값)을 같은 features 행에 AND.
    // low_confidence 로 표시된 축은 제외 (키 없으면 통과: coalesce(…, false)).
    const conds: string[] = []
    if (attrKey && attrValue) {
      const kP = push(attrKey)
      const vP = push(attrValue)
      conds.push(`f.attr->>${kP} = ${vP} and not coalesce(f.attr->'low_confidence' ? ${kP}, false)`)
    }
    if (navAttrKey && navAttrValues.length > 0) {
      const kP = push(navAttrKey)
      const vP = push(navAttrValues)
      conds.push(
        `f.attr->>${kP} = any(${vP}::text[]) and not coalesce(f.attr->'low_confidence' ? ${kP}, false)`
      )
    }
    if (styleTag) {
      conds.push(`f.gate_tags @> array[${push(styleTag)}]::text[]`)
    }
    where.push(
      `exists (
        select 1 from product_features_v26 f
        where f.product_id = products.id
          and ${conds.join(" and ")}
      )`
    )
  }

  // shuffle: 무필터 기본 노출용 랜덤 샘플 (프론트가 기본 상태에서만 보냄).
  // ORDER BY random() 은 풀스캔이라 프로덕션 규모에선 TABLESAMPLE SYSTEM 등으로 최적화 여지
  // 있음 — dev 허용 비용으로 두고 주석만 남긴다.
  let orderBy = "last_seen_at desc nulls last"
  if (sort === "price_asc") orderBy = "coalesce(sale_price, price) asc nulls last"
  else if (sort === "price_desc") orderBy = "coalesce(sale_price, price) desc nulls last"
  else if (sort === "shuffle") orderBy = "random()"

  // 필터 파라미터 스냅샷 (limit/offset/표본 seed 이전) — countOnly 와 캐시 키에 사용
  const whereSql = where.join(" and ")
  const filterParams = [...params]

  // 셔플은 ORDER BY random() 풀스캔이 6초대라, 5% 블록 표본(TABLESAMPLE SYSTEM)에서만
  // 섞는다 — REPEATABLE(seed) 로 표본이 고정되어 setseed 와 함께 페이지네이션도 안정.
  // 표본 5% ≈ 1.2만 행이면 기본 뷰 노출(60×수 페이지)에 충분하다.
  let fromClause = "products"
  const useSample = sort === "shuffle" && seed != null
  if (useSample) {
    const tsP = push(Math.abs(Number.isNaN(seedRaw) ? 1 : seedRaw) % 1_000_000)
    fromClause = `products tablesample system (5) repeatable (${tsP})`
  }

  const limitP = push(PAGE_SIZE)
  const offsetP = push(page * PAGE_SIZE)

  const sql = `
    select id, brand, name, price, sale_price, original_price, image_url, product_url,
           count(*) over() as _total
    from ${fromClause}
    where ${whereSql}
    order by ${orderBy}, id desc
    limit ${limitP} offset ${offsetP}
  `

  try {
    let rows: ProductRow[]
    if (sort === "shuffle" && seed != null) {
      // setseed 는 커넥션 스코프라 같은 client 에서 두 문장을 순서대로 실행해야 한다 —
      // 같은 seed 면 random() 순서가 재현되어 offset 페이지네이션이 안정된다.
      const client = await pool.connect()
      try {
        await client.query("select setseed($1)", [seed])
        rows = (await client.query<ProductRow>(sql, params)).rows
      } finally {
        client.release()
      }
    } else {
      rows = (await pool.query<ProductRow>(sql, params)).rows
    }
    let total: number
    if (useSample) {
      // 표본 쿼리의 윈도우 카운트는 표본 수 — 실제 total 은 캐시된 count(*) 로
      const cacheKey = whereSql + "|" + JSON.stringify(filterParams)
      const hit = totalCache.get(cacheKey)
      if (hit && Date.now() - hit.at < TOTAL_CACHE_MS) {
        total = hit.total
      } else {
        total = await countOnly(where, filterParams)
        totalCache.set(cacheKey, { at: Date.now(), total })
      }
    } else {
      total = rows.length > 0 ? parseInt(rows[0]._total, 10) : await countOnly(where, filterParams)
    }
    const products = rows.map((r) => ({
      id: String(r.id),
      brand: r.brand,
      name: r.name,
      price: r.price,
      salePrice: r.sale_price,
      originalPrice: r.original_price,
      imageUrl: r.image_url,
      productUrl: r.product_url,
    }))
    return NextResponse.json({products, total, page, totalPages: Math.ceil(total / PAGE_SIZE)})
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed"
    return NextResponse.json({error: message}, {status: 500})
  }
}

// 페이지 범위를 벗어나 rows 가 비면 window count 를 못 얻으므로 별도 count (드문 경로)
async function countOnly(where: string[], filterParams: unknown[]): Promise<number> {
  const {rows} = await pool.query<{count: string}>(
    `select count(*) as count from products where ${where.join(" and ")}`,
    filterParams
  )
  return parseInt(rows[0]?.count ?? "0", 10)
}
