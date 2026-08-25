"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import styles from "../chat.module.css"
import { track } from "@/lib/analytics"

// 앱스토어 랜딩 — ct(campaign token)에 유입 소재(utm_content)를 실어 전달.
// Apple App Analytics의 ct는 pt(provider token) 없이는 집계되지 않지만, 우리 측 측정은
// app_store_click Amplitude 이벤트(utm 자동 부착)가 담당하고, pt 발급 시 붙이기만 하면 된다.
const APP_STORE_URL = "https://apps.apple.com/kr/app/kiko-ai/id6787153872"

function openAppStore() {
  let ct = "web_landing"
  try {
    const utm = JSON.parse(sessionStorage.getItem("kiko_utm") || "{}")
    if (utm.utm_content) ct = String(utm.utm_content)
  } catch {
    // sessionStorage 접근 실패 시 기본 캠페인명 유지
  }
  track("app_store_click", { ct })
  window.open(`${APP_STORE_URL}?ct=${encodeURIComponent(ct)}&mt=8`, "_blank", "noopener")
}

// 상단 네비 — 좌: Explore/Chat 탭 · 중앙: Kiko 로고 · 우: "앱에서 열기" 검정 알약
// 탭 재질 = kikoai-mobile Glass.chip (흰 반투명 + hairline separator + Elevation.raised, radius pill)
// Finder는 별도 탭이 아니라 /explore#finder(히어로 아래 daydream 섹션)로 통합됐다.
export default function Nav() {
  const pathname = usePathname()
  const isChat = pathname?.startsWith("/chat")
  const isExplore = !isChat

  return (
    <div className={styles.nav}>
      <div className={styles.navIn}>
        <div className={styles.navL}>
          <div className={styles.navTabs}>
            <Link
              href="/explore"
              className={`${styles.navTab} ${isExplore ? styles.navTabOn : ""}`}
            >
              Explore
            </Link>
            <Link href="/chat" className={`${styles.navTab} ${isChat ? styles.navTabOn : ""}`}>
              Chat
            </Link>
          </div>
        </div>
        <Link href="/explore" aria-label="Kiko 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/kiko-logo.svg" alt="Kiko" />
        </Link>
        <button className={styles.navCta} type="button" onClick={openAppStore}>
          앱에서 열기
        </button>
      </div>
    </div>
  )
}
