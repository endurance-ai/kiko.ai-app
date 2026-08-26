import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetRateLimiterForTest,
  chatRateConfig,
  hitKstDaily,
  hitWindow,
  kstDateKey,
  msUntilKstMidnight,
  resolveClientIp,
} from "./rate-limit"

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/chat/stream", { method: "POST", headers })
}

beforeEach(() => {
  __resetRateLimiterForTest()
})

describe("resolveClientIp", () => {
  it("takes the LAST x-forwarded-for hop — ALB appends the real source IP", () => {
    expect(resolveClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9")
  })

  it("ignores a client-forged leading hop", () => {
    // 클라이언트가 XFF 를 위조해 보내도 ALB 가 뒤에 실제 IP 를 붙인다.
    // 첫 항목을 쓰면 리밋을 무한히 우회당한다.
    expect(resolveClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9")
  })

  it("returns null for a docker/VPC internal last hop", () => {
    // XFF 체인이 예상과 다를 때의 안전장치 — 전원이 한 버킷에 묶이면 안 된다.
    expect(resolveClientIp(req({ "x-forwarded-for": "203.0.113.9, 172.31.59.31" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "10.0.0.5" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "192.168.1.1" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "127.0.0.1" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "100.100.0.1" }))).toBeNull()
  })

  it("returns null when no forwarding header is present (local dev)", () => {
    expect(resolveClientIp(req({}))).toBeNull()
  })

  it("falls back to x-real-ip", () => {
    expect(resolveClientIp(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7")
  })

  it("normalizes IPv4-mapped IPv6, brackets and ports", () => {
    expect(resolveClientIp(req({ "x-forwarded-for": "::ffff:203.0.113.9" }))).toBe("203.0.113.9")
    expect(resolveClientIp(req({ "x-forwarded-for": "203.0.113.9:41234" }))).toBe("203.0.113.9")
    expect(resolveClientIp(req({ "x-forwarded-for": "[2001:db8::1]" }))).toBe("2001:db8::1")
  })

  it("rejects IPv6 loopback / ULA / link-local but keeps a public v6", () => {
    expect(resolveClientIp(req({ "x-forwarded-for": "::1" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "fd00::1" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "fe80::1" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1")
  })

  it("rejects garbage that is not an IP at all", () => {
    expect(resolveClientIp(req({ "x-forwarded-for": "unknown" }))).toBeNull()
    expect(resolveClientIp(req({ "x-forwarded-for": "999.1.1.1" }))).toBeNull()
  })
})

describe("hitWindow", () => {
  it("allows exactly `limit` hits then blocks", () => {
    const t = 1_000_000
    for (let i = 1; i <= 5; i++) {
      expect(hitWindow("k", 5, 60_000, t).ok).toBe(true)
    }
    const blocked = hitWindow("k", 5, 60_000, t)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBe(60)
  })

  it("does not extend the window when a blocked client keeps hammering", () => {
    const t = 1_000_000
    for (let i = 0; i < 20; i++) hitWindow("k", 5, 60_000, t + i)
    // 윈도우 시작(t) 기준 60s 뒤엔 열려야 한다 — 마지막 요청 기준이 아니라.
    expect(hitWindow("k", 5, 60_000, t + 60_000).ok).toBe(true)
  })

  it("keys are isolated — one IP cannot starve another", () => {
    const t = 1_000_000
    for (let i = 0; i < 6; i++) hitWindow("chat:m:203.0.113.9", 5, 60_000, t)
    expect(hitWindow("chat:m:203.0.113.10", 5, 60_000, t).ok).toBe(true)
  })

  it("treats limit <= 0 as disabled", () => {
    for (let i = 0; i < 100; i++) expect(hitWindow("k", 0, 60_000, 1).ok).toBe(true)
  })
})

describe("KST daily bucket", () => {
  it("derives the KST calendar date", () => {
    // 2026-08-26T15:30:00Z === 2026-08-27 00:30 KST
    expect(kstDateKey(Date.parse("2026-08-26T15:30:00Z"))).toBe("2026-08-27")
    expect(kstDateKey(Date.parse("2026-08-26T14:30:00Z"))).toBe("2026-08-26")
  })

  it("counts down to the next KST midnight", () => {
    expect(msUntilKstMidnight(Date.parse("2026-08-26T14:00:00Z"))).toBe(60 * 60 * 1000)
  })

  it("rolls over at KST midnight", () => {
    const beforeMidnight = Date.parse("2026-08-26T14:59:00Z") // 23:59 KST
    const afterMidnight = Date.parse("2026-08-26T15:01:00Z") // 00:01 KST 다음 날
    expect(hitKstDaily("g", 1, beforeMidnight).ok).toBe(true)
    expect(hitKstDaily("g", 1, beforeMidnight).ok).toBe(false)
    expect(hitKstDaily("g", 1, afterMidnight).ok).toBe(true)
  })
})

describe("chatRateConfig", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it("defaults to 5/min, 60/hour, 800/day, enabled", () => {
    delete process.env.CHAT_RATE_ENABLED
    delete process.env.CHAT_RATE_PER_MIN
    delete process.env.CHAT_RATE_PER_HOUR
    delete process.env.CHAT_RATE_DAILY_GLOBAL
    expect(chatRateConfig()).toEqual({ enabled: true, perMin: 5, perHour: 60, dailyGlobal: 800 })
  })

  it("honours env overrides and the kill switch", () => {
    process.env.CHAT_RATE_ENABLED = "false"
    process.env.CHAT_RATE_PER_MIN = "12"
    expect(chatRateConfig().enabled).toBe(false)
    expect(chatRateConfig().perMin).toBe(12)
  })

  it("falls back to the default on unparsable values", () => {
    process.env.CHAT_RATE_PER_HOUR = "not-a-number"
    expect(chatRateConfig().perHour).toBe(60)
  })
})

describe("route gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function post(headers: Record<string, string>) {
    const { POST } = await import("@/app/api/chat/stream/route")
    return POST(new Request("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ message: "가을 코트" }),
    }))
  }

  it("returns 429 with Retry-After once an IP exceeds the per-minute limit", async () => {
    vi.stubEnv("KIKO_AI_TOKEN", "test-token")
    vi.stubEnv("KIKO_AI_BASE", "http://127.0.0.1:1") // 업스트림은 연결 실패(502) — 게이트만 본다
    __resetRateLimiterForTest()

    const codes: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await post({ "x-forwarded-for": "203.0.113.42" })
      codes.push(res.status)
      if (res.status === 429) {
        expect(res.headers.get("Retry-After")).toBeTruthy()
        expect((await res.json()).detail).toContain("잠시 후")
      }
    }
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true)
    expect(codes[5]).toBe(429)
  })
})
