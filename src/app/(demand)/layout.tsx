import type {Metadata} from "next"
import ViewportVar from "../(chat)/_components/ViewportVar"
import AmplitudeInit from "@/components/AmplitudeInit"
import styles from "../(chat)/chat.module.css"
import demandStyles from "./celeb.module.css"
import {WaitlistProvider} from "./_Waitlist"

// 2차 수요검증(셀럽 손민수 fake-door) 전용 셸.
// (chat) 셸과 분리 — 광고 유입 집중용이라 Explore/Chat 탭 네비를 빼고, 토큰(.root)·
// 계측(AmplitudeInit: UTM 수집 + main_screen_viewed)·ViewportVar(인앱 웹뷰 높이)만 재사용한다.
const TITLE = "Kiko | 최애처럼 입고 싶을 때"
const DESC = "좋아하는 셀럽이 입은 그 옷, 비슷한 옷까지 키코가 찾아둘게요."
export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  icons: {icon: "https://kikoai.me/icon.png"},
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://kikoai.me/celeb",
    siteName: "Kiko",
    type: "website",
    images: [{url: "https://kikoai.me/og-explore.png", width: 1200, height: 630}],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["https://kikoai.me/og-explore.png"],
  },
}

export default function DemandShellLayout({children}: {children: React.ReactNode}) {
  return (
    <div className={`${styles.root} ${demandStyles.frameShell}`}>
      <ViewportVar />
      <AmplitudeInit />
      <WaitlistProvider>{children}</WaitlistProvider>
    </div>
  )
}
