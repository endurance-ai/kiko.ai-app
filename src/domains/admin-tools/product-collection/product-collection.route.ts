import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {getAdminStatus, requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

export const PLANNER_STATUSES = [
  "planner_draft",
  "planner_classified",
  "product_collection_requested",
  "cancelled",
] as const

export const TECH_STATUSES = [
  "not_started",
  "tech_detected",
  "needs_config",
  "config_ready",
  "crawl_ready",
  "crawled",
  "qc_failed",
  "import_ready",
  "imported",
  "embed_ready",
  "embedded",
  "active",
  "blocked",
] as const

export const CONFIG_STATUSES = ["not_started", "needed", "ready", "blocked"] as const
export const PRICE_BANDS = ["unknown", "budget", "mid", "premium", "luxury"] as const
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

const GENDER_VALUES = new Set(["women", "men", "unisex"])
const MAX_LIMIT = 200

export type PlannerStatus = (typeof PLANNER_STATUSES)[number]
export type TechStatus = (typeof TECH_STATUSES)[number]
export type ConfigStatus = (typeof CONFIG_STATUSES)[number]
export type PriceBand = (typeof PRICE_BANDS)[number]
export type PlatformType = (typeof PLATFORM_TYPES)[number]
export type CategoryDiscovery = (typeof CATEGORY_DISCOVERY)[number]

export type ProductCollectionTarget = {
  id: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  brand_name: string
  homepage_url: string
  gender_scope: string[]
  price_band: PriceBand
  priority: number
  planner_status: PlannerStatus
  planner_notes: string | null
  requested_at: string | null
  platform_key: string | null
  platform_type: PlatformType
  category_discovery: CategoryDiscovery
  categories: unknown[]
  detection: Record<string, unknown>
  tech_status: TechStatus
  config_status: ConfigStatus
  latest_artifact_path: string | null
  latest_artifact_sha256: string | null
  qc_summary: Record<string, unknown>
  last_error: string | null
  blocked_reason: string | null
  tech_notes: string | null
  detected_at: string | null
  crawl_ready_at: string | null
  imported_at: string | null
  embedded_at: string | null
}

export type ProductCollectionRun = {
  id: number
  target_id: number | null
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

type CreateBody = {
  brand_name?: unknown
  homepage_url?: unknown
  gender_scope?: unknown
  price_band?: unknown
  priority?: unknown
  planner_status?: unknown
  planner_notes?: unknown
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const out = value.trim().slice(0, max)
  return out.length > 0 ? out : null
}

function cleanOptionalString(value: unknown, max: number): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const out = value.trim().slice(0, max)
  return out.length > 0 ? out : null
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function parseGenderScope(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => GENDER_VALUES.has(v))
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const plannerStatus = sp.get("planner_status")
  const techStatus = sp.get("tech_status")
  const q = (sp.get("q") ?? "").trim()
  const limit = clamp(parseInt(sp.get("limit") ?? "100"), 1, MAX_LIMIT, 100)
  const offset = clamp(parseInt(sp.get("offset") ?? "0"), 0, 100000, 0)

  let query = supabase
    .from("product_collection_targets")
    .select("*", {count: "exact"})
    .order("priority", {ascending: true})
    .order("updated_at", {ascending: false})
    .range(offset, offset + limit - 1)

  if (isOneOf(plannerStatus, PLANNER_STATUSES)) query = query.eq("planner_status", plannerStatus)
  if (isOneOf(techStatus, TECH_STATUSES)) query = query.eq("tech_status", techStatus)
  if (q) {
    const like = `%${q}%`
    query = query.or(`brand_name.ilike.${like},homepage_url.ilike.${like},platform_key.ilike.${like}`)
  }

  const {data, count, error} = await query
  if (error) {
    console.error("[product-collection] list failed:", error)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }

  const targets = (data ?? []) as ProductCollectionTarget[]
  let runs: ProductCollectionRun[] = []
  const targetIds = targets.map((t) => t.id)
  if (targetIds.length > 0) {
    const {data: runRows, error: runsError} = await supabase
      .from("product_collection_runs")
      .select("*")
      .in("target_id", targetIds)
      .order("created_at", {ascending: false})
      .limit(100)
    if (runsError) {
      console.error("[product-collection] runs failed:", runsError)
    } else {
      runs = (runRows ?? []) as ProductCollectionRun[]
    }
  }

  return NextResponse.json({
    targets,
    runs,
    total: count ?? 0,
    limit,
    offset,
    generated_at: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const status = await getAdminStatus()
  const actor = status.user?.email ?? null

  const body = (await request.json().catch(() => null)) as CreateBody | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  const brandName = cleanString(body.brand_name, 200)
  const rawUrl = cleanString(body.homepage_url, 500)
  if (!brandName || !rawUrl) {
    return NextResponse.json({error: "brand_name and homepage_url required"}, {status: 400})
  }
  const homepageUrl = normalizeUrl(rawUrl)
  if (!homepageUrl) {
    return NextResponse.json({error: "homepage_url must be http(s) URL"}, {status: 400})
  }

  const priceBand = isOneOf(body.price_band, PRICE_BANDS) ? body.price_band : "unknown"
  const plannerStatus = isOneOf(body.planner_status, PLANNER_STATUSES)
    ? body.planner_status
    : "planner_classified"
  const priority = clamp(Number(body.priority ?? 3), 1, 5, 3)
  const genderScope = parseGenderScope(body.gender_scope)

  const {data, error} = await supabase
    .from("product_collection_targets")
    .insert({
      brand_name: brandName,
      homepage_url: homepageUrl,
      gender_scope: genderScope,
      price_band: priceBand,
      priority,
      planner_status: plannerStatus,
      planner_notes: cleanOptionalString(body.planner_notes, 2000),
      created_by: actor,
      updated_by: actor,
      requested_at: plannerStatus === "product_collection_requested" ? new Date().toISOString() : null,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({error: "homepage_url already exists"}, {status: 409})
    }
    console.error("[product-collection] create failed:", error)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }

  return NextResponse.json({target: data as ProductCollectionTarget})
}
