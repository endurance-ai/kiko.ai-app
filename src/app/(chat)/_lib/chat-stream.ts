// Chat streaming contract — mirrors kikoai-mobile's SSE chat client 1:1 so the web
// chat and the app speak the exact same event grammar against the same backend.
//
// Server contract (see kikoai-mobile):
//   POST {BASE}/v1/chat/sessions            (new session)
//   POST {BASE}/v1/chat/sessions/{sid}/messages (continue session)
//   body: { message, gender: 'women'|'men'|null, price_max: null, attached_image_url: null }
//   response: SSE (text/event-stream), events separated by a blank line ("\n\n"),
//             "data:" lines carry JSON. Event order: session → text_delta* → product* → search → done
//             (error instead of done on failure; cap_reached instead of the text/product/search
//             sequence once the caller's daily quota is used up).

import { PRODUCTS, pickTurn, krw, type Product } from "./mock-products"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProductRef {
  image_url: string
  caption: string
  product_id: number | null
}

export interface ParsedCaption {
  brand: string
  category?: string
  price: number | null
  name: string
  platform?: string
}

/** 일일 사용량 한도 도달 — text/product/search 대신 이 이벤트 하나만 온다. */
export interface CapReachedPayload {
  code: string
  user_tier: string
  used: number
  cap: number
  remaining: number
  /** ISO 8601 — 한도가 풀리는 시각 */
  reset_at: string
  cta: string
}

/** 서버 재질문(선택지 버튼) — 예: 성별 확인. 탭 시 callback 을 콜백 엔드포인트로 POST */
export interface ClarifyPayload {
  axis: string
  prompt: string
  options: { label: string; callback: string }[]
}

export type ChatEvent =
  | { type: "session"; session_id: string }
  | { type: "text_delta"; delta: string }
  | { type: "product"; image_url: string; caption: string; product_id: number | null }
  | { type: "search"; search_id: string; total: number }
  | { type: "clarify"; payload: ClarifyPayload }
  | { type: "done"; detail?: string }
  | { type: "error"; detail: string }
  | ({ type: "cap_reached" } & CapReachedPayload)

export interface ChatStreamHandlers {
  onSession?: (sessionId: string) => void
  onTextDelta?: (delta: string) => void
  onProduct?: (product: ProductRef) => void
  onSearch?: (searchId: string, total: number) => void
  onClarify?: (payload: ClarifyPayload) => void
  onCapReached?: (payload: CapReachedPayload) => void
  onDone?: () => void
  onError?: (detail: string) => void
}

export interface StartChatStreamParams {
  message: string
  gender: "women" | "men" | null
  sessionId: string | null
  /** clarify 버튼 탭 — 있으면 message 대신 콜백 엔드포인트로 전송 (모바일 문법) */
  callback?: { data: string; label: string }
}

// ── Caption parsing (ported from kikoai-mobile parseStreamCaption) ─────────
//
// 브랜드[ · 서브카테고리]   ← 첫 줄, " · " split [0]=브랜드
// 💰 ₩가격                  ← "💰" 시작 줄, 숫자만 추출
// 상품명                     ← 그 다음 줄
// 🏬 플랫폼                 ← "🏬" 시작 줄, 카드에는 표시하지 않음

export function parseStreamCaption(rawCaption: string): ParsedCaption {
  const clean = (rawCaption ?? "").replace(/<[^>]+>/g, "")
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let brand = ""
  let category: string | undefined
  if (lines.length > 0) {
    const [b, c] = lines[0].split(" · ")
    brand = (b ?? "").trim()
    category = c?.trim() || undefined
  }

  let price: number | null = null
  let platform: string | undefined
  let priceLineIdx = -1

  lines.forEach((line, idx) => {
    if (line.startsWith("💰")) {
      priceLineIdx = idx
      const digits = line.replace(/[^0-9]/g, "")
      price = digits ? Number(digits) : null
    } else if (line.startsWith("🏬")) {
      platform = line.replace("🏬", "").trim()
    }
  })

  let name = ""
  if (priceLineIdx >= 0) {
    const next = lines[priceLineIdx + 1]
    if (next && !next.startsWith("🏬")) name = next
  }

  return { brand, category, price, name, platform }
}

// ── PDP 상세 (GET /v1/products/{id} — 모바일 ProductDetail 계약) ────────────

export interface SimilarProduct {
  id: number
  brand: string
  name: string
  price: number
  original_price?: number | null
  sale_price?: number | null
  image_url: string
  product_url: string
}

export interface ProductDetail {
  id: number
  brand: string
  name: string
  category?: string | null
  subcategory?: string | null
  price: number
  original_price?: number | null
  sale_price?: number | null
  image_url: string
  images?: string[] | null
  product_url: string
  in_stock?: boolean
  platform?: string | null
  description?: string | null
  similar?: SimilarProduct[] | null
}

/** PDP 상세 조회 — 프록시 경유. 실패 시 null (호출부는 카드 fallback으로 렌더 유지) */
export async function fetchProductDetail(id: number, searchId?: string | null): Promise<ProductDetail | null> {
  try {
    const qs = searchId ? `?search_id=${encodeURIComponent(searchId)}` : ""
    const res = await fetch(`/api/product/${id}${qs}`)
    if (!res.ok) return null
    const json = (await res.json()) as ProductDetail
    if (typeof json?.id !== "number") return null
    return json
  } catch {
    return null
  }
}

/** 상품 중복 방어 키: product_id → image_url → caption 순 */
export function dedupeKey(p: ProductRef): string {
  if (p.product_id != null) return `id:${p.product_id}`
  if (p.image_url) return `img:${p.image_url}`
  return `cap:${p.caption}`
}

// ── Live driver ──────────────────────────────────────────────────────────
// POST to our same-origin proxy (/api/chat/stream) and parse the SSE body
// manually via res.body.getReader() — EventSource can't do POST.

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = ""
  const dataLines: string[] = []
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join("\n") }
}

function classifyPayload(data: Record<string, unknown>): ChatEvent["type"] | null {
  if (data.code === "cap_reached") return "cap_reached"
  if (typeof data.delta === "string") return "text_delta"
  if (typeof data.image_url === "string") return "product"
  if (Array.isArray(data.options)) return "clarify"
  if (typeof data.total === "number") return "search"
  if (typeof data.cap === "number" && typeof data.used === "number") return "cap_reached"
  if (typeof data.session_id === "string") return "session"
  if (typeof data.detail === "string") return "error"
  return null
}

function dispatchSseBlock(rawBlock: string, handlers: ChatStreamHandlers) {
  const parsed = parseSseBlock(rawBlock)
  if (!parsed) return
  let data: Record<string, unknown>
  try {
    data = JSON.parse(parsed.data)
  } catch {
    return
  }

  const kind = (parsed.event as ChatEvent["type"]) || classifyPayload(data)
  switch (kind) {
    case "session":
      if (typeof data.session_id === "string") handlers.onSession?.(data.session_id)
      break
    case "text_delta":
      if (typeof data.delta === "string") handlers.onTextDelta?.(data.delta)
      break
    case "product":
      handlers.onProduct?.({
        image_url: typeof data.image_url === "string" ? data.image_url : "",
        caption: typeof data.caption === "string" ? data.caption : "",
        product_id: typeof data.product_id === "number" ? data.product_id : null,
      })
      break
    case "search":
      handlers.onSearch?.(
        typeof data.search_id === "string" ? data.search_id : "",
        typeof data.total === "number" ? data.total : 0
      )
      break
    case "clarify": {
      const rawOptions = Array.isArray(data.options) ? data.options : []
      const options = rawOptions
        .map((o) => {
          const opt = o as Record<string, unknown>
          return {
            label: typeof opt.label === "string" ? opt.label : "",
            callback: typeof opt.callback === "string" ? opt.callback : "",
          }
        })
        .filter((o) => o.label && o.callback)
      if (options.length > 0) {
        handlers.onClarify?.({
          axis: typeof data.axis === "string" ? data.axis : "",
          prompt: typeof data.prompt === "string" ? data.prompt : "",
          options,
        })
      }
      break
    }
    case "cap_reached":
      handlers.onCapReached?.({
        code: typeof data.code === "string" ? data.code : "cap_reached",
        user_tier: typeof data.user_tier === "string" ? data.user_tier : "",
        used: typeof data.used === "number" ? data.used : 0,
        cap: typeof data.cap === "number" ? data.cap : 0,
        remaining: typeof data.remaining === "number" ? data.remaining : 0,
        reset_at: typeof data.reset_at === "string" ? data.reset_at : "",
        cta: typeof data.cta === "string" ? data.cta : "",
      })
      break
    case "error":
      handlers.onError?.(typeof data.detail === "string" ? data.detail : "알 수 없는 오류가 발생했습니다")
      break
    case "done":
      handlers.onDone?.()
      break
    default:
      // progress(무음 하트비트) 등 미지 이벤트는 무시 — done 으로 오인하면
      // 스피너가 조기 소멸하고 전송 잠금이 풀린다
      break
  }
}

/** 실서버 드라이버 — /api/chat/stream 프록시로 POST 후 SSE 바디를 수동 파싱한다. */
export function startChatStream(
  { message, gender, sessionId, callback }: StartChatStreamParams,
  handlers: ChatStreamHandlers
): AbortController {
  const controller = new AbortController()

  const stalledRef = { value: false }
  ;(async () => {
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          gender,
          price_max: null,
          attached_image_url: null,
          session_id: sessionId,
          callback_data: callback?.data ?? null,
          callback_label: callback?.label ?? null,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = `요청에 실패했습니다 (${res.status})`
        try {
          const j = await res.json()
          if (j?.detail) detail = j.detail
        } catch {
          // ignore — keep default detail
        }
        handlers.onError?.(detail)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      // 무응답 타임아웃 (모바일 stall 가드와 동일 취지): 이벤트가 20초 동안 아무것도
      // 안 오면 죽은 스트림으로 보고 끊는다. 서버는 검색 중에도 progress 하트비트를
      // 3~4초마다 보내므로 정상 검색(30초짜리 포함)은 절대 안 걸린다.
      let stallTimer: ReturnType<typeof setTimeout> | undefined
      const bumpStall = () => {
        if (stallTimer) clearTimeout(stallTimer)
        stallTimer = setTimeout(() => {
          stalledRef.value = true
          controller.abort()
        }, 20_000)
      }
      bumpStall()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bumpStall()
          buffer += decoder.decode(value, { stream: true })

          let sepIdx: number
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, sepIdx)
            buffer = buffer.slice(sepIdx + 2)
            dispatchSseBlock(block, handlers)
          }
        }
      } finally {
        if (stallTimer) clearTimeout(stallTimer)
      }
      if (buffer.trim()) dispatchSseBlock(buffer, handlers)
      // 스트림이 done 이벤트 없이 닫힌 경우에도 턴을 완료 처리 (전송 잠금 고착 방지, 멱등)
      handlers.onDone?.()
    } catch (err) {
      if (controller.signal.aborted) {
        // 무응답 타임아웃으로 우리가 끊은 경우엔 에러로 알리고 잠금을 푼다
        if (stalledRef.value) handlers.onError?.("응답이 늦어지고 있어요. 다시 시도해 주세요.")
        return
      }
      handlers.onError?.(err instanceof Error ? err.message : "스트림 연결에 실패했습니다")
    }
  })()

  return controller
}

// ── Mock driver ──────────────────────────────────────────────────────────
// Live 토큰이 없을 때의 데모용 드라이버. mock-products.ts의 PRODUCTS로 실제 SSE와
// 동일한 이벤트 시퀀스(session → text_delta* → product* → search → done)를 타이밍까지 재현한다.

let mockTurnCounter = 0

/** 데모용 일일 한도 — 이 값째 턴(1-indexed)부터 cap_reached를 emit한다. */
const MOCK_DAILY_CAP = 5

function nextMidnightIso(): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return next.toISOString()
}

function chunkText(text: string, minLen = 2, maxLen = 4): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []
  let i = 0
  while (i < chars.length) {
    const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1))
    chunks.push(chars.slice(i, i + len).join(""))
    i += len
  }
  return chunks
}

function buildMockParagraph(query: string): string {
  const q = query.trim() || "이 요청"
  return `"${q}" 취향에 맞는 상품들을 골라 봤어요. 과하지 않은 톤과 실루엣 위주로, 예산대가 다른 옵션도 섞었어요.`
}

function platformFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

function buildMockCaption(p: Product): string {
  const lines = [p.brand, `💰 ${krw(p.price)}`, p.name]
  const platform = platformFromUrl(p.url)
  if (platform) lines.push(`🏬 ${platform}`)
  return lines.join("\n")
}

/** 데모용 드라이버 — 라이브 토큰이 없을 때 page.tsx가 대신 사용한다. */
export function startMockChatStream(
  params: StartChatStreamParams,
  handlers: ChatStreamHandlers
): AbortController {
  const controller = new AbortController()
  const timers: ReturnType<typeof setTimeout>[] = []
  let elapsed = 0

  controller.signal.addEventListener("abort", () => {
    timers.forEach(clearTimeout)
  })

  const schedule = (delay: number, fn: () => void) => {
    elapsed += delay
    const t = setTimeout(() => {
      if (controller.signal.aborted) return
      fn()
    }, elapsed)
    timers.push(t)
  }

  schedule(0, () => handlers.onSession?.(`mock-${Date.now().toString(36)}`))

  // 세션당 턴 수는 "새 검색"으로도 리셋되지 않는다 — 실제 일일 한도처럼, 한 번 다 쓰면
  // 계속 다 쓴 상태를 재현하기 위해 이 카운터는 chat-store 리셋과 독립적으로 유지한다.
  const turnIndex = mockTurnCounter
  mockTurnCounter += 1

  // turnIndex는 0-indexed이므로 4(=5번째 턴)부터 한도 도달로 취급한다.
  if (turnIndex >= MOCK_DAILY_CAP - 1) {
    schedule(220, () =>
      handlers.onCapReached?.({
        code: "cap_reached",
        user_tier: "free",
        used: MOCK_DAILY_CAP,
        cap: MOCK_DAILY_CAP,
        remaining: 0,
        reset_at: nextMidnightIso(),
        cta: "app",
      })
    )
    return controller
  }

  const paragraph = buildMockParagraph(params.message)
  const chunks = chunkText(paragraph)
  chunks.forEach((chunk, idx) => {
    const delay = idx === 0 ? 300 : 20 + Math.floor(Math.random() * 21)
    schedule(delay, () => handlers.onTextDelta?.(chunk))
  })

  const items = pickTurn(turnIndex)
  items.forEach((p, idx) => {
    const delay = idx === 0 ? 260 : 120
    schedule(delay, () =>
      handlers.onProduct?.({
        image_url: p.img,
        caption: buildMockCaption(p),
        product_id: PRODUCTS.indexOf(p),
      })
    )
  })

  schedule(160, () => handlers.onSearch?.(`mock-search-${Date.now().toString(36)}`, 84))
  schedule(40, () => handlers.onDone?.())

  return controller
}
