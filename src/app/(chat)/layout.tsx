import Nav from "./_components/Nav"
import AmplitudeInit from "@/components/AmplitudeInit"
import styles from "./chat.module.css"

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
