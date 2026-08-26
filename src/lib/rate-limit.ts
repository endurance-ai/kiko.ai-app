/**
 * 랜딩(/explore·/chat)의 챗 엔드포인트용 인메모리 레이트리밋.
 *
 * dev-app 에는 Redis 가 없고(ai-server 의 Redis 는 dev-ai 소속) `app` 컨테이너는
 * 1개다(infra/01-servers.md §B-5). 그래서 프로세스 로컬 Map 이 곧 전역 카운터다.
 * 컨테이너 재기동 시 카운터가 리셋되는 건 감수한 트레이드오프.
 */

import { logger } from "@/lib/logger"

// ── 클라이언트 IP 해석 ────────────────────────────────────────────────────────
//
// 요청 체인: 클라이언트 → ALB → web 컨테이너(Next fallback rewrite) → app.
// ALB 는 클라이언트가 보낸 X-Forwarded-For 뒤에 실제 소스 IP 를 *append* 하고,
// Next 의 rewrite 프록시는 XFF 를 건드리지 않고 그대로 넘긴다(next 의
// router-utils/proxy-request 는 xfwd 를 켜지 않고 x-forwarded-host 만 세팅).
// ⇒ **마지막 항목**이 신뢰할 수 있는 실제 클라이언트 IP다.
//    흔한 `xff.split(",")[0]` 은 여기서 클라이언트가 위조할 수 있으므로 쓰면 안 된다.

/** IPv4-mapped IPv6(`::ffff:1.2.3.4`) 를 v4 표기로 되돌리고 포트를 떼어낸다. */
function normalizeIp(raw: string): string {
  let ip = raw.trim()
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]")
    ip = end > 0 ? ip.slice(1, end) : ip.slice(1)
  }
  // `1.2.3.4:5678` 형태만 포트를 제거한다 (bare IPv6 는 콜론이 여러 개).
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"))
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  return mapped ? mapped[1] : ip
}

/**
 * 사설·루프백·링크로컬·CGNAT 이거나 IP 형식이 아니면 true.
 *
 * 이게 이 모듈의 안전장치다. XFF 체인이 예상과 달라 도커 내부 IP(172.31.x.x 등)가
 * 잡히면 "모든 방문자가 한 버킷에 묶여 다 같이 차단"되는 사고가 난다. 그런 주소를
 * 미해결로 떨어뜨려 per-IP 검사를 fail-open 시키면 그 사고가 구조적으로 불가능해진다.
 */
function isNonRoutable(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase()
    if (v6 === "::1" || v6 === "::") return true
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true // fe80::/10 link-local
    return !/^[0-9a-f:]+$/.test(v6) // 형식 불명 → 미해결
  }
  const parts = ip.split(".")
  if (parts.length !== 4) return true
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = nums
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  )
}

/** 라우팅 가능한 클라이언트 IP. 해석 불가면 null(호출부는 fail-open 해야 한다). */
export function resolveClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const hops = xff.split(",").map((h) => normalizeIp(h)).filter(Boolean)
    const last = hops[hops.length - 1]
    if (last && !isNonRoutable(last)) return last
  }
  const real = req.headers.get("x-real-ip")
  if (real) {
    const ip = normalizeIp(real)
    if (ip && !isNonRoutable(ip)) return ip
  }
  return null
}

// ── 고정 윈도우 카운터 ────────────────────────────────────────────────────────

interface Window {
  count: number
  resetAt: number
}

export interface HitResult {
  ok: boolean
  count: number
  /** 차단 시 남은 초. 통과 시 0. */
  retryAfterSec: number
}

const MAX_ENTRIES = 50_000
const SWEEP_INTERVAL_MS = 60_000

const windows = new Map<string, Window>()
let lastSweepAt = 0

function sweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && windows.size < MAX_ENTRIES) return
  lastSweepAt = now
  for (const [key, win] of windows) {
    if (now >= win.resetAt) windows.delete(key)
  }
  if (windows.size >= MAX_ENTRIES) {
    // 여기까지 오면 정상 트래픽이 아니다. 통째로 비우고 fail-open —
    // 메모리를 지키는 쪽이 카운터 정확도보다 우선이다.
    logger.warn({ size: windows.size }, "chat_rate_table_overflow")
    windows.clear()
  }
}

/**
 * `key` 의 고정 윈도우 카운터를 1 올리고 `limit` 초과 여부를 돌려준다.
 * `limit <= 0` 이면 그 제한은 꺼진 것으로 보고 항상 통과한다.
 *
 * 차단된 요청도 카운트에 포함되지만 `resetAt` 은 밀리지 않는다 —
 * 계속 때려도 윈도우가 연장되지는 않는다.
 */
export function hitWindow(key: string, limit: number, windowMs: number, now: number = Date.now()): HitResult {
  if (limit <= 0) return { ok: true, count: 0, retryAfterSec: 0 }
  sweep(now)
  const cur = windows.get(key)
  if (!cur || now >= cur.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, count: 1, retryAfterSec: 0 }
  }
  cur.count += 1
  if (cur.count > limit) {
    return { ok: false, count: cur.count, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) }
  }
  return { ok: true, count: cur.count, retryAfterSec: 0 }
}

// ── KST 하루 버킷 ─────────────────────────────────────────────────────────────
//
// ai-server 의 일일 토큰 캡(token_cap._seconds_until_kst_midnight)과 같은 경계를 쓴다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** KST 기준 YYYY-MM-DD. */
export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 다음 KST 자정까지 남은 ms. */
export function msUntilKstMidnight(now: number = Date.now()): number {
  return DAY_MS - ((now + KST_OFFSET_MS) % DAY_MS)
}

/** KST 자정에 리셋되는 하루 카운터. */
export function hitKstDaily(prefix: string, limit: number, now: number = Date.now()): HitResult {
  return hitWindow(`${prefix}:${kstDateKey(now)}`, limit, msUntilKstMidnight(now), now)
}

// ── 설정 ─────────────────────────────────────────────────────────────────────

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export interface ChatRateConfig {
  enabled: boolean
  perMin: number
  perHour: number
  dailyGlobal: number
}

/**
 * env 는 매 호출 읽는다 — 컨테이너 recreate 없이 값만 바꿔볼 일이 없더라도,
 * 모듈 로드 시점 캐싱보다 테스트가 쉽다. 0 은 "그 제한 끔".
 */
export function chatRateConfig(): ChatRateConfig {
  return {
    enabled: (process.env.CHAT_RATE_ENABLED ?? "true").trim().toLowerCase() !== "false",
    perMin: intEnv("CHAT_RATE_PER_MIN", 5),
    perHour: intEnv("CHAT_RATE_PER_HOUR", 60),
    dailyGlobal: intEnv("CHAT_RATE_DAILY_GLOBAL", 800),
  }
}

/** 테스트 전용 — 프로세스 로컬 카운터를 비운다. */
export function __resetRateLimiterForTest(): void {
  windows.clear()
  lastSweepAt = 0
}
