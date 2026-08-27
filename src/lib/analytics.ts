import * as amp from "@amplitude/analytics-browser"
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser"

// 웹 랜딩 계측 — 모바일과 같은 이벤트명 재사용, platform:web + UTM + request_id.
// request_id는 Langfuse 트레이스와 조인하는 상관키.

let started = false
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

export function initAmplitude(): void {
  if (started || typeof window === "undefined") return
  // 클라이언트 번들에 항상 실리는 공개 키 — CI 도커 빌드에 env 주입이 없어 폴백을 인라인.
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || "96ba8ecb2b48db88cc5f27bf403798ec"
  if (!key) return
  started = true
  amp.add(sessionReplayPlugin({sampleRate: 1, privacyConfig: {defaultMaskLevel: "medium"}}))
  amp.init(key, {defaultTracking: true})

  const q = new URLSearchParams(location.search)
  const utm: Record<string, string> = {}
  UTM_KEYS.forEach((k) => {
    const v = q.get(k)
    if (v) utm[k] = v
  })
  const id = new amp.Identify()
  Object.entries(utm).forEach(([k, v]) => id.setOnce(k, v)) // 첫 유입값 보존
  amp.identify(id)
  sessionStorage.setItem("kiko_utm", JSON.stringify(utm))

  track("main_screen_viewed")
}

function utm(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem("kiko_utm") || "{}")
  } catch {
    return {}
  }
}

export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function track(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || !started) return
  amp.track(name, {platform: "web", ...utm(), ...props})
}

export function deviceId(): string | undefined {
  return amp.getDeviceId()
}
