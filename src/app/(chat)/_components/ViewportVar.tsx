"use client"

import { useEffect } from "react"

// 인앱 브라우저(인스타·디코 등)는 CSS 100vh/100dvh를 자기 크롬 뒤 영역까지 과대계산해
// 중앙정렬 히어로가 아래로 밀린다. JS의 innerHeight는 실제 가시 높이를 정확히 주므로
// --vvh 변수로 주입 — 디자인(중앙정렬)을 바꾸지 않고 모든 웹뷰에서 사파리와 동일 렌더.
export default function ViewportVar() {
  useEffect(() => {
    const set = () => {
      document.documentElement.style.setProperty("--vvh", `${window.innerHeight}px`)
    }
    set()
    window.addEventListener("resize", set)
    window.visualViewport?.addEventListener("resize", set)
    return () => {
      window.removeEventListener("resize", set)
      window.visualViewport?.removeEventListener("resize", set)
    }
  }, [])
  return null
}
