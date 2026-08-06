import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

type Ctx = {params: Promise<{id: string}>}

type WikiSource = {type?: string; url?: string; title?: string}
type WikiConfidence = Record<string, number>

type WikiPatch = {
  instagram_handle?: string | null
  instagram_url?: string | null
  homepage_url?: string | null
  founder?: string[] | null
  founded_year?: number | null
  origin_country?: string | null
  sources?: WikiSource[] | null
  confidence?: WikiConfidence | null
  review_reasons?: string[] | null
  status?: "ok" | "review" | "no_data" | null
}

type BrandInfoPatch = WikiPatch & {description?: string | null}

const CURRENT_YEAR = new Date().getFullYear()
const COUNTRY_RE = /^[A-Z]{2}$/
const URL_RE = /^https?:\/\//
const ALLOWED_KEYS = new Set<keyof BrandInfoPatch>([
  "instagram_handle",
  "instagram_url",
  "homepage_url",
  "description",
  "founder",
  "founded_year",
  "origin_country",
  "sources",
  "confidence",
  "review_reasons",
  "status",
])
const ALLOWED_STATUS = new Set(["ok", "review", "no_data"])

function validate(body: unknown): {ok: true; patch: BrandInfoPatch} | {ok: false; error: string} {
  if (!body || typeof body !== "object") return {ok: false, error: "body required"}
  const b = body as Record<string, unknown>
  const patch: BrandInfoPatch = {}

  for (const k of Object.keys(b)) {
    if (!ALLOWED_KEYS.has(k as keyof BrandInfoPatch)) return {ok: false, error: `unknown field: ${k}`}
  }

  if ("origin_country" in b) {
    const v = b.origin_country
    if (v !== null && (typeof v !== "string" || !COUNTRY_RE.test(v))) {
      return {ok: false, error: "origin_country must match ^[A-Z]{2}$"}
    }
    patch.origin_country = v as string | null
  }

  if ("founded_year" in b) {
    const v = b.founded_year
    if (v !== null) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1700 || v > CURRENT_YEAR) {
        return {ok: false, error: `founded_year must be integer 1700..${CURRENT_YEAR}`}
      }
    }
    patch.founded_year = v as number | null
  }

  for (const k of ["instagram_url", "homepage_url"] as const) {
    if (k in b) {
      const v = b[k]
      if (v !== null && (typeof v !== "string" || (v.length > 0 && !URL_RE.test(v)))) {
        return {ok: false, error: `${k} must be http(s) url`}
      }
      patch[k] = (v as string | null) ?? null
    }
  }

  for (const k of ["instagram_handle", "description"] as const) {
    if (k in b) {
      const v = b[k]
      if (v !== null && typeof v !== "string") return {ok: false, error: `${k} must be string`}
      patch[k] = (v as string | null) ?? null
    }
  }

  if ("founder" in b) {
    const v = b.founder
    if (v !== null) {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
        return {ok: false, error: "founder must be string[]"}
      }
    }
    patch.founder = v as string[] | null
  }

  if ("review_reasons" in b) {
    const v = b.review_reasons
    if (v !== null) {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
        return {ok: false, error: "review_reasons must be string[]"}
      }
    }
    patch.review_reasons = v as string[] | null
  }

  if ("status" in b) {
    const v = b.status
    if (v !== null && (typeof v !== "string" || !ALLOWED_STATUS.has(v))) {
      return {ok: false, error: "status must be ok|review|no_data"}
    }
    patch.status = v as WikiPatch["status"]
  }

  if ("sources" in b) {
    const v = b.sources
    if (v !== null) {
      if (!Array.isArray(v)) return {ok: false, error: "sources must be array"}
      for (const s of v) {
        if (!s || typeof s !== "object") return {ok: false, error: "sources[] must be objects"}
        const src = s as Record<string, unknown>
        // url 은 http(s) 만 허용 — javascript:/data: 스킴 XSS 차단
        if (src.url !== undefined && src.url !== null) {
          if (typeof src.url !== "string" || !URL_RE.test(src.url)) {
            return {ok: false, error: "sources[].url must be http(s) url"}
          }
        }
        for (const f of ["type", "title"] as const) {
          if (src[f] !== undefined && src[f] !== null && typeof src[f] !== "string") {
            return {ok: false, error: `sources[].${f} must be string`}
          }
        }
      }
    }
    patch.sources = v as WikiSource[] | null
  }

  if ("confidence" in b) {
    const v = b.confidence
    if (v !== null && (typeof v !== "object" || Array.isArray(v))) {
      return {ok: false, error: "confidence must be object"}
    }
    patch.confidence = v as WikiConfidence | null
  }

  return {ok: true, patch}
}

/**
 * PATCH /api/admin/brand-nodes/[id]/wiki — update description and merge wiki jsonb. Admin verified.
 * SPEC-BRAND-WIKI-001 M2.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  const body = await request.json().catch(() => null)
  const v = validate(body)
  if (!v.ok) return NextResponse.json({error: v.error}, {status: 400})

  const {data: existing, error: fetchErr} = await supabase
    .from("brand_nodes")
    .select("wiki, description")
    .eq("id", numericId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({error: fetchErr.message}, {status: 500})
  if (!existing) return NextResponse.json({error: "brand not found"}, {status: 404})

  const prevWiki = (existing.wiki as Record<string, unknown> | null) ?? {}
  const prevConfidence = (prevWiki.confidence as Record<string, number> | undefined) ?? {}
  const cleanedWiki = {...prevWiki}
  delete cleanedWiki.description_ko
  delete cleanedWiki.description_original
  const {description: nextDescription, ...wikiPatch} = v.patch

  const merged: Record<string, unknown> = {
    ...cleanedWiki,
    ...wikiPatch,
    confidence: {
      ...prevConfidence,
      ...(wikiPatch.confidence ?? {}),
      overall: 1.0, // admin-verified
    },
    enriched_at: new Date().toISOString(),
    schema_version: (prevWiki.schema_version as string | undefined) ?? "1.0",
  }

  // .select().single() 으로 0-row update 를 silent no-op 으로 두지 않음 (TOCTOU 방어).
  const update: {wiki: Record<string, unknown>; description?: string | null} = {wiki: merged}
  if (Object.prototype.hasOwnProperty.call(v.patch, "description")) {
    update.description = nextDescription ?? null
  }

  const {data: updated, error: updErr} = await supabase
    .from("brand_nodes")
    .update(update)
    .eq("id", numericId)
    .select("wiki, description")
    .single()
  if (updErr) return NextResponse.json({error: "update failed"}, {status: 500})

  return NextResponse.json({
    ok: true,
    description: updated.description ?? null,
    wiki: updated.wiki ?? merged,
  })
}
