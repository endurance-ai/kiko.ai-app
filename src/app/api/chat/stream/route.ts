// Same-origin proxy for the live chat SSE backend. The browser talks only to this
// route (no CORS issue); this route attaches the server-side bearer token and
// forwards the request to the upstream kiko-ai chat service, streaming the SSE
// body straight through untouched.
//
// 이 라우트는 익명 공개다 — 랜딩(/explore·/chat)의 모든 방문자가 하나의 서버측
// KIKO_AI_TOKEN 을 공유해서 LLM 을 태운다. 그래서 여기가 유일한 어뷰징 방어선이고,
// per-IP 레이트리밋 + 랜딩 전체의 하루 요청 예산을 아래에서 건다.

import { logger } from "@/lib/logger"
import { chatRateConfig, hitKstDaily, hitWindow, resolveClientIp } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

const TOO_FAST = "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요."
const TOO_BUSY = "지금 이용자가 많아요. 잠시 후 다시 시도해 주세요."

// XFF 체인 가정(ALB 가 append → Next rewrite 가 그대로 통과)이 실제로 맞는지
// 배포 직후 로그 레벨을 건드리지 않고 확인하기 위한 프로세스당 1회 프로브.
let ipProbeLogged = false

function tooManyRequests(detail: string, retryAfterSec: number): Response {
  return Response.json(
    { detail },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)), "Cache-Control": "no-store" } }
  )
}

/** 레이트리밋 게이트. 통과면 null, 차단이면 그대로 반환할 429 Response. */
function rateLimit(req: Request): Response | null {
  const cfg = chatRateConfig()
  if (!cfg.enabled) return null

  const ip = resolveClientIp(req)

  if (!ipProbeLogged) {
    ipProbeLogged = true
    logger.info(
      { resolved: ip, xff: req.headers.get("x-forwarded-for"), xRealIp: req.headers.get("x-real-ip") },
      "chat_rate_ip_probe"
    )
  }

  // ip === null 이면 per-IP 는 fail-open. 도커 내부 IP 로 전원이 한 버킷에 묶여
  // 다 같이 차단되는 것보다, 방어가 안 되는 편이 낫다(글로벌 예산은 여전히 건다).
  if (ip) {
    const perMin = hitWindow(`chat:m:${ip}`, cfg.perMin, MINUTE_MS)
    if (!perMin.ok) {
      logger.warn({ scope: "minute", ip, count: perMin.count, limit: cfg.perMin }, "chat_rate_limited")
      return tooManyRequests(TOO_FAST, perMin.retryAfterSec)
    }
    const perHour = hitWindow(`chat:h:${ip}`, cfg.perHour, HOUR_MS)
    if (!perHour.ok) {
      logger.warn({ scope: "hour", ip, count: perHour.count, limit: cfg.perHour }, "chat_rate_limited")
      return tooManyRequests(TOO_FAST, perHour.retryAfterSec)
    }
  }

  // 랜딩 전체 하루 예산 — 여러 IP 를 쓰는 봇이 per-IP 를 우회했을 때의 비용 천장.
  // KST 자정 리셋(ai-server 의 일일 토큰 캡과 같은 경계).
  const daily = hitKstDaily("chat:global", cfg.dailyGlobal)
  if (!daily.ok) {
    logger.warn({ scope: "global-day", count: daily.count, limit: cfg.dailyGlobal }, "chat_rate_limited")
    return tooManyRequests(TOO_BUSY, daily.retryAfterSec)
  }

  return null
}

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

  // 본문 파싱 전에 건다 — 거절이 싸야 폭주를 흡수할 수 있다.
  // clarify 버튼 탭(callback_data)도 LLM 턴을 소비하므로 똑같이 카운트된다.
  const limited = rateLimit(req)
  if (limited) return limited

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
