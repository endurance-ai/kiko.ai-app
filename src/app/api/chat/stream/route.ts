// Same-origin proxy for the live chat SSE backend. The browser talks only to this
// route (no CORS issue); this route attaches the server-side bearer token and
// forwards the request to the upstream kiko-ai chat service, streaming the SSE
// body straight through untouched.

export const dynamic = "force-dynamic"

const DEFAULT_BASE = "https://dev-ai.kikoai.me"

interface ChatStreamRequestBody {
  message?: string
  gender?: "women" | "men" | null
  price_max?: number | null
  attached_image_url?: string | null
  session_id?: string | null
  /** clarify 버튼 탭 — 있으면 message 대신 콜백 엔드포인트로 보낸다 */
  callback_data?: string | null
  callback_label?: string | null
}

export async function POST(req: Request) {
  const token = process.env.KIKO_AI_TOKEN
  const base = process.env.KIKO_AI_BASE || DEFAULT_BASE

  if (!token) {
    return Response.json({ detail: "live chat not configured" }, { status: 501 })
  }

  let body: ChatStreamRequestBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ detail: "invalid request body" }, { status: 400 })
  }

  const sessionId = typeof body.session_id === "string" && body.session_id ? body.session_id : null
  const isCallback = typeof body.callback_data === "string" && body.callback_data.length > 0

  if (isCallback && !sessionId) {
    return Response.json({ detail: "callback requires session_id" }, { status: 400 })
  }

  const upstreamUrl = isCallback
    ? `${base}/v1/chat/sessions/${encodeURIComponent(sessionId!)}/callback`
    : sessionId
      ? `${base}/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`
      : `${base}/v1/chat/sessions`

  const upstreamBody = isCallback
    ? { callback_data: body.callback_data, label: body.callback_label ?? null }
    : {
        message: body.message ?? "",
        gender: body.gender ?? null,
        price_max: body.price_max ?? null,
        attached_image_url: body.attached_image_url ?? null,
      }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(upstreamBody),
    })
  } catch {
    return Response.json({ detail: "upstream connection failed" }, { status: 502 })
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    let detail = `upstream error (${upstreamRes.status})`
    try {
      const j = await upstreamRes.json()
      if (j?.detail) detail = j.detail
    } catch {
      // ignore — keep default detail
    }
    return Response.json({ detail }, { status: upstreamRes.status || 502 })
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
