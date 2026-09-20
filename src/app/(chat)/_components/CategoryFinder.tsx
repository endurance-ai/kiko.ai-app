import FinderSection from "./FinderSection"

// explore 히어로 아래 "카테고리로 찾기" 브라우징 섹션(파인더).
// 메인홈(explore/page.tsx)에서 이 컴포넌트 렌더 한 줄만 주석 처리하면 카테고리
// 파인더가 통째로 사라진다(스크롤 힌트도 같이 주석 처리할 것 — 짝지어 토글).
// nav(100px) 아래로 스크롤 걸리도록 여유를 준 anchor(#finder).
export default function CategoryFinder({ gender }: { gender: "여성" | "남성" }) {
  return (
    <section id="finder" style={{ scrollMarginTop: 90 }}>
      <FinderSection gender={gender} />
    </section>
  )
}
