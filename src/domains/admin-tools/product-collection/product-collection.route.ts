import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

export const CRAWL_STATUSES = [
  "not_started",
  "tech_detected",
  "crawled",
  "qc_failed",
  "imported",
  "embedded",
  "active",
  "blocked",
] as const

export const CONFIG_STATUSES = ["not_started", "needed", "ready", "blocked"] as const
export const PLATFORM_TYPES = [
  "unknown",
  "cafe24",
  "shopify",
  "custom",
  "uniqlo",
  "zara",
  "29cm",
  "farfetch",
] as const
export const CATEGORY_DISCOVERY = ["unknown", "manual", "auto"] as const

export type CrawlStatus = (typeof CRAWL_STATUSES)[number]
export type ConfigStatus = (typeof CONFIG_STATUSES)[number]
export type PlatformType = (typeof PLATFORM_TYPES)[number]
export type CategoryDiscovery = (typeof CATEGORY_DISCOVERY)[number]

export type ProductCrawlBrand = {
  brand_node_id: number
  brand_name: string
  brand_name_normalized: string | null
  gender_scope: string[] | null
  source_platforms: string[] | null
  price_min_usd: number | string | null
  price_max_usd: number | string | null
  wiki: Record<string, unknown> | null
  homepage_url: string | null
  wiki_status: string | null
  brand_updated_at: string | null
  status_created_at: string | null
  status_updated_at: string | null
  has_status_row: boolean
  status: CrawlStatus
  config_status: ConfigStatus
  platform_key: string | null
  platform_type: PlatformType
  category_discovery: CategoryDiscovery
  categories: unknown[]
  detection: Record<string, unknown>
  latest_artifact_path: string | null
  latest_artifact_sha256: string | null
  qc_summary: Record<string, unknown>
  last_error: string | null
  blocked_reason: string | null
  notes: string | null
  detected_at: string | null
  crawled_at: string | null
  imported_at: string | null
  embedded_at: string | null
}

export type ProductCrawlRun = {
  id: number
  brand_node_id: number
  created_at: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  stage: "detect" | "config" | "crawl" | "qc" | "import" | "embed" | "manual"
  status: "queued" | "running" | "success" | "failed" | "skipped"
  command: string | null
  actor: string | null
  platform_key: string | null
  metrics: Record<string, unknown>
  artifact_path: string | null
  error_message: string | null
}

const MAX_LIMIT = 200
const SINCE_STYLE_NODE_ROLLOUT = "2026-06-01" // 브랜드 크롤 상태는 이 시점 이후 갱신된 brand_node만 대상으로 함
export const SCHEMA_MISSING_MESSAGE =
  "DB migration 091_brand_node_product_crawl_status.sql is not applied. product_crawl_* objects are missing."

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function cleanSearch(value: string): string {
  return value.replace(/[,%]/g, " ").trim().slice(0, 100)
}

async function countBrands(filters: {
  status?: string | null
  platformType?: string | null
  urlFilter?: string | null
  q?: string
}): Promise<number> {
  let query = supabase
    .from("product_crawl_brands")
    .select("*", {count: "exact", head: true})
    .gte("brand_updated_at", SINCE_STYLE_NODE_ROLLOUT)

  if (isOneOf(filters.status, CRAWL_STATUSES)) query = query.eq("status", filters.status)
  if (isOneOf(filters.platformType, PLATFORM_TYPES)) query = query.eq("platform_type", filters.platformType)
  if (filters.urlFilter === "missing") query = query.is("homepage_url", null)
  else if (filters.urlFilter === "present") query = query.not("homepage_url", "is", null)
  if (filters.q) {
    const like = `%${filters.q}%`
    query = query.or(
      `brand_name.ilike.${like},brand_name_normalized.ilike.${like},homepage_url.ilike.${like},platform_key.ilike.${like}`,
    )
  }

  const {count, error} = await query
  if (error) throw error
  return count ?? 0
}

export function isProductCrawlSchemaMissing(error: {code?: string; message?: string; details?: string}): boolean {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    text.includes("product_crawl_brands") ||
    text.includes("product_crawl_status") ||
    text.includes("product_crawl_runs")
  )
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const status = sp.get("status") ?? sp.get("tech_status")
  const platformType = sp.get("platform_type")
  const urlFilter = sp.get("url")
  const q = cleanSearch(sp.get("q") ?? "")
  const limit = clamp(parseInt(sp.get("limit") ?? "100", 10), 1, MAX_LIMIT, 100)
  const offset = clamp(parseInt(sp.get("offset") ?? "0", 10), 0, 100000, 0)

  let query = supabase
    .from("product_crawl_brands")
    .select("*", {count: "exact"})
    .gte("brand_updated_at", SINCE_STYLE_NODE_ROLLOUT)
    .order("brand_updated_at", {ascending: false, nullsFirst: false})
    .order("brand_name_normalized", {ascending: true, nullsFirst: false})
    .range(offset, offset + limit - 1)

  if (isOneOf(status, CRAWL_STATUSES)) query = query.eq("status", status)
  if (isOneOf(platformType, PLATFORM_TYPES)) query = query.eq("platform_type", platformType)
  if (urlFilter === "missing") query = query.is("homepage_url", null)
  else if (urlFilter === "present") query = query.not("homepage_url", "is", null)
  if (q) {
    const like = `%${q}%`
    query = query.or(
      `brand_name.ilike.${like},brand_name_normalized.ilike.${like},homepage_url.ilike.${like},platform_key.ilike.${like}`,
    )
  }

  const {data, count, error} = await query
  if (error) {
    if (isProductCrawlSchemaMissing(error)) {
      console.error("[product-collection] schema missing:", error)
      return NextResponse.json({
        brands: [],
        runs: [],
        total: 0,
        limit,
        offset,
        stats: {not_started: 0, tech_detected: 0, crawled: 0, missing_url: 0},
        generated_at: new Date().toISOString(),
        schema_missing: true,
        error: SCHEMA_MISSING_MESSAGE,
      })
    }
    console.error("[product-collection] brand list failed:", error)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }

  const brands = (data ?? []) as ProductCrawlBrand[]
  const brandIds = brands.map((b) => b.brand_node_id)
  let runs: ProductCrawlRun[] = []
  if (brandIds.length > 0) {
    const {data: runRows, error: runsError} = await supabase
      .from("product_crawl_runs")
      .select("*")
      .in("brand_node_id", brandIds)
      .order("created_at", {ascending: false})
      .limit(100)
    if (runsError) {
      if (isProductCrawlSchemaMissing(runsError)) {
        console.error("[product-collection] runs schema missing:", runsError)
      } else {
        console.error("[product-collection] runs failed:", runsError)
      }
    } else {
      runs = (runRows ?? []) as ProductCrawlRun[]
    }
  }

  const [notStarted, techDetected, crawled, missingUrl] = await Promise.all([
    countBrands({status: "not_started", platformType, urlFilter, q}),
    countBrands({status: "tech_detected", platformType, urlFilter, q}),
    countBrands({status: "crawled", platformType, urlFilter, q}),
    countBrands({status, platformType, urlFilter: "missing", q}),
  ])

  return NextResponse.json({
    brands,
    runs,
    total: count ?? 0,
    limit,
    offset,
    stats: {not_started: notStarted, tech_detected: techDetected, crawled, missing_url: missingUrl},
    schema_missing: false,
    generated_at: new Date().toISOString(),
  })
}

export async function POST() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  return NextResponse.json(
    {
      error:
        "product collection targets are derived from brand_nodes; create or enrich the brand_node first",
    },
    {status: 405},
  )
}
