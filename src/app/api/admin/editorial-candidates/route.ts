import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {generateEditorialCandidates} from "@/domains/admin-tools/search-debug/ai-client"

export const maxDuration = 180

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = (await request.json().catch(() => ({}))) as {
    concept?: unknown
    gender?: unknown
    limit?: unknown
  }
  const concept = typeof body.concept === "string" ? body.concept.trim() : ""
  const gender =
    body.gender === "men" || body.gender === "unisex" ? body.gender : "women"
  const rawLimit = typeof body.limit === "number" ? body.limit : 30
  const limit = Math.min(48, Math.max(6, Math.round(rawLimit)))

  if (concept.length < 2 || concept.length > 500) {
    return NextResponse.json(
      {ok: false, error: "concept must be 2-500 characters"},
      {status: 400}
    )
  }

  const result = await generateEditorialCandidates({concept, gender, limit})
  return NextResponse.json(result)
}
