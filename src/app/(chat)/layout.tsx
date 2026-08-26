import type {Metadata} from "next"
import Nav from "./_components/Nav"
import AmplitudeInit from "@/components/AmplitudeInit"
import styles from "./chat.module.css"

// 광고 랜딩 탭 타이틀·미리보기 — 어드민(root layout)의 "kiko.ai Admin"을 랜딩 스코프에서 덮어쓴다.
// 파비콘·OG 이미지는 kikoai.me(마케팅 원페이저)가 서빙 — 랜딩은 kikoai.me 도메인으로만 광고 유입.
const LANDING_TITLE = "Kiko | AI-Powered Fashion Discovery Platform"
const LANDING_DESC =
  "Kiko is a curated, personalized fashion discovery platform, bringing style search, visual inspiration, and shoppable pieces from 5,000+ fashion brands in one place."
export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESC,
  icons: {icon: "https://kikoai.me/icon.png"},
  openGraph: {
    title: LANDING_TITLE,
    description: LANDING_DESC,
    url: "https://kikoai.me/explore",
    siteName: "Kiko",
    type: "website",
    images: [{url: "https://kikoai.me/og-explore.png", width: 1200, height: 630}],
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESC,
    images: ["https://kikoai.me/og-explore.png"],
  },
}

// /explore, /chat 공용 셸 — mockup(chat/index.html)의 nav + 페이지 wrapper를 1:1 이식.
// 토큰(:root)은 이 레이아웃의 최상위 wrapper(.root)에 스코프해 admin 전역 스타일과 분리한다.
// AmplitudeInit: 랜딩 스코프에서만 계측 초기화 (어드민 트래픽 미포함) — UTM 수집 + main_screen_viewed
export default function ChatShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <AmplitudeInit />
      <Nav />
      {children}
    </div>
  )
}
