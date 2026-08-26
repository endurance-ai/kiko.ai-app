"use client"

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { BorderBeam } from "border-beam"
import styles from "../chat.module.css"
import FinderSection from "../_components/FinderSection"
import { EXAMPLES_BY_GENDER } from "../_lib/examples"
import { track } from "@/lib/analytics"

// 신뢰 서브라인 라이브 수치 — 최근 24시간 갱신 상품 수 (/api/stats/fresh).
// fetch 도착 전과 실패 시엔 이 폴백을 유지한다.
const FRESH_COUNT_FALLBACK = 30000

// 타이핑 플레이스홀더 — 한 글자씩 타이핑 → 잠시 유지 → 지우고 다음 문구 (daydream 문법)
function useTypingPlaceholder(phrases: string[]) {
  const [text, setText] = useState("")
  useEffect(() => {
    let phrase = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const cur = phrases[phrase % phrases.length]
      if (!deleting) {
        char++
        setText(cur.slice(0, char))
        if (char >= cur.length) {
          deleting = true
          timer = setTimeout(tick, 1700) // 완성 후 유지
          return
        }
        timer = setTimeout(tick, 65)
      } else {
        char -= 2
        if (char <= 0) {
          char = 0
          deleting = false
          phrase++
          setText("")
          timer = setTimeout(tick, 350)
          return
        }
        setText(cur.slice(0, char))
        timer = setTimeout(tick, 22) // 빠른 삭제
      }
    }
    setText("")
    timer = setTimeout(tick, 300)
    return () => clearTimeout(timer)
  }, [phrases])
  return text
}

// HERO 절반 — /chat/index.html의 #hero 섹션을 1:1 이식.
// 검색 제출(Enter/전송/예시칩)은 /chat?q=... 로 핸드오프한다.
// 그 아래, daydream 패턴대로 finder-mockup/finder.html을 1:1 이식한 FinderSection을
// #finder 앵커로 접어 넣는다 (히어로=풀뷰포트 채팅 컴포저, 스크롤 아래=카테고리 브라우징).
// 성별 세그먼트 상태는 여기서 끌어올려 FinderSection에도 그대로 전달한다.
export default function ExplorePage() {
  const router = useRouter()
  const [gender, setGender] = useState<"female" | "male">("female")
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const examples = EXAMPLES_BY_GENDER[gender]
  const typingPlaceholder = useTypingPlaceholder(examples)
  const [freshCount, setFreshCount] = useState(FRESH_COUNT_FALLBACK)

  useEffect(() => {
    fetch("/api/stats/fresh")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j?.fresh === "number" && j.fresh > 0) setFreshCount(j.fresh)
      })
      .catch(() => {})
  }, [])

  const submit = (q: string) => {
    const query = q.trim()
    if (!query) return
    // 성별 토글 값을 챗에 전달 — 서버 계약: women | men (미전달 시 서버가 재질문)
    const g = gender === "female" ? "women" : "men"
    router.push(`/chat?q=${encodeURIComponent(query)}&g=${g}`)
  }

  const onInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = Math.min(el.scrollHeight, 140) + "px"
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 IME 조합 중 Enter는 무시 — 마지막 음절이 별도 제출되는 이중 서밋 버그 방지
    if (e.nativeEvent.isComposing) return
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault()
      submit(value)
    }
  }

  return (
    <>
    <section className={styles.hero}>
      <h1 className={styles.headline}>
        5,000+ 패션 브랜드를
        <br />
        채팅 하나로
      </h1>
      {/* 신뢰 서브라인 (직행 패턴: 타이틀 아래 라이브 수치) — 오늘 날짜 + 최근 24h 갱신 상품 실측.
          자정 직후 SSR/CSR 날짜가 어긋날 수 있어 suppressHydrationWarning */}
      <p className={styles.subline} suppressHydrationWarning>
        {new Date().getMonth() + 1}월 {new Date().getDate()}일, 가장 신선한 상품 업데이트{" "}
        {freshCount.toLocaleString("ko-KR")}개
      </p>
      <div className={styles.seg}>
        <button
          type="button"
          className={gender === "female" ? styles.segOn : undefined}
          onClick={() => setGender("female")}
        >
          여성
        </button>
        <button
          type="button"
          className={gender === "male" ? styles.segOn : undefined}
          onClick={() => setGender("male")}
        >
          남성
        </button>
      </div>

      <div className={styles.askwrap}>
        <BorderBeam
          size="pulse-outside"
          colorVariant="sunset"
          theme="light"
          duration={4.5}
          strength={0.75}
          borderRadius={24}
        >
          <div className={styles.askbox}>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={typingPlaceholder}
              value={value}
              onChange={onInput}
              onKeyDown={onKeyDown}
            />
            {/* 이미지 첨부는 보류 — 텍스트 검색만 (사용자 확정) */}
            <div className={styles.askrow}>
              <button
                className={`${styles.sendbtn} ${value.trim() ? styles.sendReady : ""}`}
                aria-label="검색"
                type="button"
                onClick={() => submit(value)}
              >
                <span>↑</span>
              </button>
            </div>
          </div>
        </BorderBeam>
      </div>

      {/* 예시 칩 2줄 — 명시적 행 분리: 행 안 간격이 항상 균일 (그리드 컬럼 방식은
          칩 폭이 제각각이라 간격이 틀어짐). 모바일에선 두 줄이 함께 가로 스크롤 */}
      <div className={styles.exwrap}>
        {[examples.slice(0, 4), examples.slice(4)].map((row, ri) => (
          <div key={ri} className={`${styles.exrow} ${ri === 1 ? styles.exrow2 : ""}`}>
            {row.map((q) => (
              <button
                key={q}
                className={`${styles.chip} ${styles.chipGlass}`}
                type="button"
                onClick={() => {
                  track("chip_tap", { label: q, gender }) // 계측: JTBD 예시 칩 반응
                  submit(q)
                }}
              >
                {q}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 스크롤 힌트 — SF Symbols chevron.compact.down 지오메트리 재현.
          히어로 아래 카테고리 파인더가 접혀 있다는 신호 + 탭 시 스무스 스크롤 */}
      <button
        type="button"
        className={styles.scrollHint}
        aria-label="카테고리로 찾기로 이동"
        onClick={() => document.getElementById("finder")?.scrollIntoView({ behavior: "smooth" })}
      >
        <svg width="30" height="12" viewBox="0 0 30 12" fill="none" aria-hidden="true">
          <path d="M2.5 2.5L15 9.5L27.5 2.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>

    {/* nav(100px) 아래로 스크롤 걸리도록 여유를 준 anchor — daydream: 히어로=풀뷰포트 컴포저,
        스크롤 아래=browse/finder */}
    <section id="finder" style={{ scrollMarginTop: 90 }}>
      <FinderSection gender={gender === "female" ? "여성" : "남성"} />
    </section>
    </>
  )
}
