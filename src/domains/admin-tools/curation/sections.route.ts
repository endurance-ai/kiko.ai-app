import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {
  deleteSection,
  type Gender,
  isAiError,
  listSections,
  lookupProducts,
  previewFeed,
  saveSection,
} from "./ai-client"
import {getEditorialActivationBlocker, MAX_CURATION_PRODUCTS} from "./editor-utils"

// 브라우저 → 이 라우트 → ai-server. 프록시를 두는 이유는 INTERNAL_API_TOKEN 을
// 서버에만 두기 위해서다 — 클라이언트가 ai-server 를 직접 부르면 토큰이 노출된다.

function parseGender(req: NextRequest): Gender | null {
  const g = req.nextUrl.searchParams.get("gender")
  return g === "women" || g === "men" ? g : null
}

async function gate(): Promise<NextResponse | null> {
  const result = await requireApprovedAdmin()
  return result instanceof NextResponse ? result : null
}

export async function GET(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied

  const gender = parseGender(req)
  if (!gender) return NextResponse.json({error: "gender must be women|men"}, {status: 400})

  const view = req.nextUrl.searchParams.get("view")

  if (view === "products") {
    const ids = (req.nextUrl.searchParams.get("ids") ?? "")
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .slice(0, MAX_CURATION_PRODUCTS)
    if (ids.length === 0) return NextResponse.json({products: [], missing: []})
    const result = await lookupProducts(gender, ids)
    if (isAiError(result)) return NextResponse.json({error: result.error}, {status: 502})
    return NextResponse.json(result)
  }

  // 목록과 preview 를 함께 준다 — 화면에서 항상 같이 쓰고, 따로 부르면
  // 그 사이에 구좌가 바뀌어 두 숫자가 어긋날 수 있다.
  const [sections, preview] = await Promise.all([listSections(gender), previewFeed(gender)])
  if (isAiError(sections)) return NextResponse.json({error: sections.error}, {status: 502})
  if (isAiError(preview)) return NextResponse.json({error: preview.error}, {status: 502})

  const shown = new Map(preview.sections.map((s) => [s.section_id, s.shown]))
  return NextResponse.json({
    sections: sections.sections.map((s) => ({
      ...s,
      shown: s.is_active ? (shown.get(s.section_id) ?? s.live_count) : s.live_count,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "invalid body"}, {status: 400})
  }

  if (body.slot_type === "editorial") {
    const ids = Array.isArray(body.product_ids)
      ? [...new Set(body.product_ids.filter((id): id is number => Number.isSafeInteger(id)))]
      : []
    if (ids.length > MAX_CURATION_PRODUCTS) {
      return NextResponse.json(
        {error: `editorial 구좌에는 상품을 최대 ${MAX_CURATION_PRODUCTS}개까지 등록할 수 있습니다.`},
        {status: 422}
      )
    }
    body.product_ids = ids

    if (body.is_active === true) {
      const gender = body.gender === "women" || body.gender === "men" ? body.gender : null
      if (!gender) return NextResponse.json({error: "gender must be women|men"}, {status: 400})
      const lookup = ids.length > 0
        ? await lookupProducts(gender, ids)
        : {products: [], missing: []}
      if (isAiError(lookup)) return NextResponse.json({error: lookup.error}, {status: 502})
      const blocker = getEditorialActivationBlocker(ids, lookup.products, lookup.missing)
      if (blocker) return NextResponse.json({error: blocker}, {status: 422})
    }
  }

  const result = await saveSection(body as Parameters<typeof saveSection>[0])
  if (isAiError(result)) return NextResponse.json({error: result.error}, {status: 502})
  return NextResponse.json(result)
}

export async function DELETE(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied

  const gender = parseGender(req)
  const sectionId = req.nextUrl.searchParams.get("section_id")
  if (!gender || !sectionId) {
    return NextResponse.json({error: "section_id and gender required"}, {status: 400})
  }

  const result = await deleteSection(sectionId, gender)
  if (isAiError(result)) return NextResponse.json({error: result.error}, {status: 502})
  return NextResponse.json(result)
}
