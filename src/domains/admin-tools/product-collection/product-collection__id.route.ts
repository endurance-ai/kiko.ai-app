import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {getAdminStatus, requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {
  CATEGORY_DISCOVERY,
  CONFIG_STATUSES,
  CRAWL_STATUSES,
  PLATFORM_TYPES,
  SCHEMA_MISSING_MESSAGE,
  isProductCrawlSchemaMissing,
  type CategoryDiscovery,
  type ConfigStatus,
  type CrawlStatus,
  type PlatformType,
  type ProductCrawlBrand,
} from "./product-collection.route"

export const dynamic = "force-dynamic"

type Ctx = {params: Promise<{id: string}>}

type PatchBody = {
  status?: unknown
  config_status?: unknown
  platform_key?: unknown
  platform_type?: unknown
  category_discovery?: unknown
  categories?: unknown
  detection?: unknown
  latest_artifact_path?: unknown
  latest_artifact_sha256?: unknown
  qc_summary?: unknown
  last_error?: unknown
  blocked_reason?: unknown
  notes?: unknown
}

function cleanString(value: unknown, max: number): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const out = value.trim().slice(0, max)
  return out.length > 0 ? out : null
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function statusTimestamps(patch: Record<string, unknown>, nowIso: string): void {
  if (patch.status === "tech_detected") patch.detected_at = nowIso
  if (patch.status === "crawled") patch.crawled_at = nowIso
  if (patch.status === "imported") patch.imported_at = nowIso
  if (patch.status === "embedded" || patch.status === "active") patch.embedded_at = nowIso
}

async function loadBrand(brandNodeId: number): Promise<ProductCrawlBrand | null> {
  const {data, error} = await supabase
    .from("product_crawl_brands")
    .select("*")
    .eq("brand_node_id", brandNodeId)
    .maybeSingle()
  if (error) throw error
  return (data as ProductCrawlBrand | null) ?? null
}

async function insertManualRun(
  brandNodeId: number,
  actor: string | null,
  before: ProductCrawlBrand,
  patch: Record<string, unknown>,
): Promise<void> {
  const metrics = {
    before: {
      status: before.status,
      config_status: before.config_status,
      platform_type: before.platform_type,
      platform_key: before.platform_key,
    },
    patch,
  }
  const {error} = await supabase.from("product_crawl_runs").insert({
    brand_node_id: brandNodeId,
    stage: "manual",
    status: "success",
    actor,
    platform_key: typeof patch.platform_key === "string" ? patch.platform_key : before.platform_key,
    metrics,
    ended_at: new Date().toISOString(),
    duration_ms: 0,
  })
  if (error) console.error("[product-collection] manual run insert failed:", error)
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id: rawId} = await ctx.params
  const id = parseId(rawId)
  if (!id) return NextResponse.json({error: "invalid brand_node_id"}, {status: 400})

  try {
    const brand = await loadBrand(id)
    if (!brand) return NextResponse.json({error: "brand_node not found"}, {status: 404})

    const {data: runs, error: runsError} = await supabase
      .from("product_crawl_runs")
      .select("*")
      .eq("brand_node_id", id)
      .order("created_at", {ascending: false})
      .limit(100)
    if (runsError) {
      if (isProductCrawlSchemaMissing(runsError)) {
        return NextResponse.json(
          {error: SCHEMA_MISSING_MESSAGE, code: "product_crawl_schema_missing"},
          {status: 503},
        )
      }
      return NextResponse.json({error: runsError.message}, {status: 500})
    }

    return NextResponse.json({brand, runs: runs ?? []})
  } catch (err) {
    if (isProductCrawlSchemaMissing(err as {code?: string; message?: string; details?: string})) {
      return NextResponse.json(
        {error: SCHEMA_MISSING_MESSAGE, code: "product_crawl_schema_missing"},
        {status: 503},
      )
    }
    return NextResponse.json({error: err instanceof Error ? err.message : "internal error"}, {status: 500})
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const status = await getAdminStatus()
  const actor = status.user?.email ?? null

  const {id: rawId} = await ctx.params
  const id = parseId(rawId)
  if (!id) return NextResponse.json({error: "invalid brand_node_id"}, {status: 400})

  const body = (await request.json().catch(() => null)) as PatchBody | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  let before: ProductCrawlBrand | null = null
  try {
    before = await loadBrand(id)
  } catch (err) {
    if (isProductCrawlSchemaMissing(err as {code?: string; message?: string; details?: string})) {
      return NextResponse.json(
        {error: SCHEMA_MISSING_MESSAGE, code: "product_crawl_schema_missing"},
        {status: 503},
      )
    }
    console.error("[product-collection] brand fetch failed:", err)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }
  if (!before) return NextResponse.json({error: "brand_node not found"}, {status: 404})

  const patch: Record<string, unknown> = {}
  const nowIso = new Date().toISOString()

  if ("status" in body) {
    if (!isOneOf(body.status, CRAWL_STATUSES)) {
      return NextResponse.json({error: "invalid status"}, {status: 400})
    }
    patch.status = body.status satisfies CrawlStatus
  }
  if ("config_status" in body) {
    if (!isOneOf(body.config_status, CONFIG_STATUSES)) {
      return NextResponse.json({error: "invalid config_status"}, {status: 400})
    }
    patch.config_status = body.config_status satisfies ConfigStatus
  }
  if ("platform_key" in body) {
    const v = cleanString(body.platform_key, 100)
    if (v && !/^[a-z][a-z0-9-]{1,40}$/.test(v)) {
      return NextResponse.json({error: "platform_key must match lowercase key format"}, {status: 400})
    }
    patch.platform_key = v
  }
  if ("platform_type" in body) {
    if (!isOneOf(body.platform_type, PLATFORM_TYPES)) {
      return NextResponse.json({error: "invalid platform_type"}, {status: 400})
    }
    patch.platform_type = body.platform_type satisfies PlatformType
  }
  if ("category_discovery" in body) {
    if (!isOneOf(body.category_discovery, CATEGORY_DISCOVERY)) {
      return NextResponse.json({error: "invalid category_discovery"}, {status: 400})
    }
    patch.category_discovery = body.category_discovery satisfies CategoryDiscovery
  }
  if ("categories" in body) {
    if (!Array.isArray(body.categories)) {
      return NextResponse.json({error: "categories must be array"}, {status: 400})
    }
    patch.categories = body.categories
  }
  if ("detection" in body) {
    if (!isObject(body.detection)) return NextResponse.json({error: "detection must be object"}, {status: 400})
    patch.detection = body.detection
  }
  if ("qc_summary" in body) {
    if (!isObject(body.qc_summary)) return NextResponse.json({error: "qc_summary must be object"}, {status: 400})
    patch.qc_summary = body.qc_summary
  }
  if ("latest_artifact_path" in body) patch.latest_artifact_path = cleanString(body.latest_artifact_path, 500)
  if ("latest_artifact_sha256" in body) patch.latest_artifact_sha256 = cleanString(body.latest_artifact_sha256, 128)
  if ("last_error" in body) patch.last_error = cleanString(body.last_error, 2000)
  if ("blocked_reason" in body) patch.blocked_reason = cleanString(body.blocked_reason, 2000)
  if ("notes" in body) patch.notes = cleanString(body.notes, 2000)

  statusTimestamps(patch, nowIso)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({error: "no fields to update"}, {status: 400})
  }

  const {data, error} = await supabase
    .from("product_crawl_status")
    .upsert({brand_node_id: id, ...patch}, {onConflict: "brand_node_id"})
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({error: "platform_key already exists"}, {status: 409})
    }
    if (isProductCrawlSchemaMissing(error)) {
      return NextResponse.json(
        {error: SCHEMA_MISSING_MESSAGE, code: "product_crawl_schema_missing"},
        {status: 503},
      )
    }
    return NextResponse.json({error: error.message}, {status: 400})
  }

  await insertManualRun(id, actor, before, patch)
  return NextResponse.json({status: data})
}
