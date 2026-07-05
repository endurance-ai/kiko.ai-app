import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {getAdminStatus, requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {
  CATEGORY_DISCOVERY,
  CONFIG_STATUSES,
  PLANNER_STATUSES,
  PLATFORM_TYPES,
  PRICE_BANDS,
  TECH_STATUSES,
  type CategoryDiscovery,
  type ConfigStatus,
  type PlannerStatus,
  type PlatformType,
  type PriceBand,
  type ProductCollectionTarget,
  type TechStatus,
} from "./product-collection.route"

export const dynamic = "force-dynamic"

type Ctx = {params: Promise<{id: string}>}

type PatchBody = {
  brand_name?: unknown
  homepage_url?: unknown
  gender_scope?: unknown
  price_band?: unknown
  priority?: unknown
  planner_status?: unknown
  planner_notes?: unknown
  platform_key?: unknown
  platform_type?: unknown
  category_discovery?: unknown
  categories?: unknown
  detection?: unknown
  tech_status?: unknown
  config_status?: unknown
  latest_artifact_path?: unknown
  latest_artifact_sha256?: unknown
  qc_summary?: unknown
  last_error?: unknown
  blocked_reason?: unknown
  tech_notes?: unknown
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

function parseGenderScope(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const allowed = new Set(["women", "men", "unisex"])
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => allowed.has(v))
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

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function statusTimestamps(patch: Record<string, unknown>, nowIso: string): void {
  if (patch.planner_status === "product_collection_requested") patch.requested_at = nowIso
  if (patch.tech_status === "tech_detected") patch.detected_at = nowIso
  if (patch.tech_status === "crawl_ready") patch.crawl_ready_at = nowIso
  if (patch.tech_status === "imported") patch.imported_at = nowIso
  if (patch.tech_status === "embedded" || patch.tech_status === "active") patch.embedded_at = nowIso
}

async function insertManualRun(
  targetId: number,
  actor: string | null,
  before: ProductCollectionTarget,
  patch: Record<string, unknown>,
): Promise<void> {
  const metrics = {
    before: {
      planner_status: before.planner_status,
      tech_status: before.tech_status,
      config_status: before.config_status,
      platform_type: before.platform_type,
      platform_key: before.platform_key,
    },
    patch,
  }
  const {error} = await supabase.from("product_collection_runs").insert({
    target_id: targetId,
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
  if (!id) return NextResponse.json({error: "invalid id"}, {status: 400})

  const {data: target, error} = await supabase
    .from("product_collection_targets")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!target) return NextResponse.json({error: "target not found"}, {status: 404})

  const {data: runs} = await supabase
    .from("product_collection_runs")
    .select("*")
    .eq("target_id", id)
    .order("created_at", {ascending: false})
    .limit(100)

  return NextResponse.json({target, runs: runs ?? []})
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const status = await getAdminStatus()
  const actor = status.user?.email ?? null

  const {id: rawId} = await ctx.params
  const id = parseId(rawId)
  if (!id) return NextResponse.json({error: "invalid id"}, {status: 400})

  const body = (await request.json().catch(() => null)) as PatchBody | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  const {data: beforeRaw, error: fetchErr} = await supabase
    .from("product_collection_targets")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({error: fetchErr.message}, {status: 500})
  if (!beforeRaw) return NextResponse.json({error: "target not found"}, {status: 404})
  const before = beforeRaw as ProductCollectionTarget

  const patch: Record<string, unknown> = {updated_by: actor}
  const nowIso = new Date().toISOString()

  if ("brand_name" in body) {
    const v = cleanString(body.brand_name, 200)
    if (!v) return NextResponse.json({error: "brand_name must be non-empty string"}, {status: 400})
    patch.brand_name = v
  }
  if ("homepage_url" in body) {
    const v = cleanString(body.homepage_url, 500)
    const url = v ? normalizeUrl(v) : null
    if (!url) return NextResponse.json({error: "homepage_url must be http(s) URL"}, {status: 400})
    patch.homepage_url = url
  }
  if ("gender_scope" in body) {
    const v = parseGenderScope(body.gender_scope)
    if (!v) return NextResponse.json({error: "gender_scope must be array"}, {status: 400})
    patch.gender_scope = v
  }
  if ("price_band" in body) {
    if (!isOneOf(body.price_band, PRICE_BANDS)) {
      return NextResponse.json({error: "invalid price_band"}, {status: 400})
    }
    patch.price_band = body.price_band satisfies PriceBand
  }
  if ("priority" in body) {
    const priority = Number(body.priority)
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return NextResponse.json({error: "priority must be 1..5"}, {status: 400})
    }
    patch.priority = priority
  }
  if ("planner_status" in body) {
    if (!isOneOf(body.planner_status, PLANNER_STATUSES)) {
      return NextResponse.json({error: "invalid planner_status"}, {status: 400})
    }
    patch.planner_status = body.planner_status satisfies PlannerStatus
  }
  if ("planner_notes" in body) patch.planner_notes = cleanString(body.planner_notes, 2000)

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
  if ("tech_status" in body) {
    if (!isOneOf(body.tech_status, TECH_STATUSES)) {
      return NextResponse.json({error: "invalid tech_status"}, {status: 400})
    }
    patch.tech_status = body.tech_status satisfies TechStatus
  }
  if ("config_status" in body) {
    if (!isOneOf(body.config_status, CONFIG_STATUSES)) {
      return NextResponse.json({error: "invalid config_status"}, {status: 400})
    }
    patch.config_status = body.config_status satisfies ConfigStatus
  }
  if ("latest_artifact_path" in body) patch.latest_artifact_path = cleanString(body.latest_artifact_path, 500)
  if ("latest_artifact_sha256" in body) patch.latest_artifact_sha256 = cleanString(body.latest_artifact_sha256, 128)
  if ("qc_summary" in body) {
    if (!isObject(body.qc_summary)) return NextResponse.json({error: "qc_summary must be object"}, {status: 400})
    patch.qc_summary = body.qc_summary
  }
  if ("last_error" in body) patch.last_error = cleanString(body.last_error, 2000)
  if ("blocked_reason" in body) patch.blocked_reason = cleanString(body.blocked_reason, 2000)
  if ("tech_notes" in body) patch.tech_notes = cleanString(body.tech_notes, 2000)

  statusTimestamps(patch, nowIso)

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({error: "no fields to update"}, {status: 400})
  }

  const {data, error} = await supabase
    .from("product_collection_targets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({error: "homepage_url or platform_key already exists"}, {status: 409})
    }
    return NextResponse.json({error: error.message}, {status: 400})
  }
  if (!data) return NextResponse.json({error: "target not found"}, {status: 404})

  await insertManualRun(id, actor, before, patch)
  return NextResponse.json({target: data as ProductCollectionTarget})
}
