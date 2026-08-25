// PDP 상세 프록시 — GET /v1/products/{id} (모바일 ProductDetail 계약 그대로 전달).
// 브라우저는 same-origin으로만 호출하고, 토큰은 서버 env에만 존재한다.

export const dynamic = "force-dynamic"

const DEFAULT_BASE = "https://dev-ai.kikoai.me"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = process.env.KIKO_AI_TOKEN
  const base = process.env.KIKO_AI_BASE || DEFAULT_BASE

  if (!token) {
    return Response.json({ detail: "live chat not configured" }, { status: 501 })
  }

  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return Response.json({ detail: "invalid product id" }, { status: 400 })
  }

  const searchId = new URL(req.url).searchParams.get("search_id")
  const upstreamUrl = `${base}/v1/products/${id}${searchId ? `?search_id=${encodeURIComponent(searchId)}` : ""}`

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return Response.json({ detail: "upstream connection failed" }, { status: 502 })
  }

  let json: unknown
  try {
    json = await upstreamRes.json()
  } catch {
    return Response.json({ detail: `upstream error (${upstreamRes.status})` }, { status: 502 })
  }

  return Response.json(json, { status: upstreamRes.status })
}
