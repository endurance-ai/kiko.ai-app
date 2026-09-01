"use client"

import {useRef, useState} from "react"
import Link from "next/link"
import {BorderBeam} from "border-beam"
import styles from "../celeb.module.css"
import chatStyles from "../../(chat)/chat.module.css"
import {trackCeleb} from "../_track"
import {CELEBS, coverOf} from "../_celebs"
import {useWaitlist} from "../_Waitlist"

// ── 2차 수요검증 랜딩 (overview) ─────────────────────────────────────────────
// apple.com 웹 언어 + Apple Music 배너 카드. 배너 = 내비게이션 → /celeb/[id] 상세로 이동.
// 카드 내부 비주얼은 추후 Figma 교체(현재는 사진/그라데이션 + 텍스트).

function ChevR() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
      <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CelebLanding() {
  const cardsRef = useRef<HTMLDivElement>(null)
  const openWaitlist = useWaitlist()
  const [searchValue, setSearchValue] = useState("")

  const openModal = (source: string) => {
    trackCeleb("cta_click", {source})
    openWaitlist(undefined, source)
  }
  // 검색 컴포저 제출 — 입력한 최애 이름을 모달 fav로 프리필
  const submitSearch = () => {
    trackCeleb("cta_click", {source: "search"})
    openWaitlist(undefined, "search", searchValue.trim() || undefined)
  }
  const scrollToCards = () => {
    trackCeleb("cta_click", {source: "hero_browse"})
    cardsRef.current?.scrollIntoView({behavior: "smooth", block: "start"})
  }

  return (
    <div className={styles.page}>
      {/* 슬림 내비 (리퀴드글래스 컨트롤 레이어) */}
      <nav className={styles.nav}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.navLogo} src="/kiko-logo.svg" alt="Kiko" />
        <button className={styles.navCta} type="button" onClick={() => openModal("nav")}>
          시작하기
        </button>
      </nav>

      {/* 중앙 히어로 + CTA */}
      <header className={styles.hero}>
        <h1 className={styles.h1}>
          <span className={styles.h1Muted}>최애가 입은 그 옷,</span>
          <br />
          그대로 입어요.
        </h1>
        <p className={styles.heroSub}>
          <span className={styles.heroSubStrong}>좋아하는 셀럽의 사복 패션</span>부터
          <br />
          비슷한데 더 저렴한 옷까지, 키코가 골라둘게요.
        </p>
        <div className={styles.heroCtas}>
          <button className={styles.btnPrimary} type="button" onClick={() => openModal("hero")}>
            시작하기
          </button>
          <button className={styles.link} type="button" onClick={scrollToCards}>
            최애 둘러보기 <ChevR />
          </button>
        </div>
      </header>

      {/* 셸프 타이틀 */}
      <div className={styles.shelfHead}>
        <h2 className={styles.shelfTitle}>어떤 셀럽을 손민수할까요?</h2>
      </div>

      {/* 셀럽 배너 카드 = 상세로 이동하는 링크 */}
      <div ref={cardsRef} className={styles.cards}>
        {CELEBS.map((c) => {
          const bannerSrc = c.cover ?? coverOf(c).photo
          return (
            <Link
              key={c.id}
              href={`/celeb/${c.id}`}
              className={styles.card}
              onClick={() => trackCeleb("celeb_open", {celeb: c.id})}
            >
              <div className={styles.banner} style={bannerSrc ? undefined : {background: c.grad}}>
                {bannerSrc && (
                  <>
                    {c.coverBlur && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.bannerBlur} src={bannerSrc} alt="" aria-hidden="true" />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={c.coverBlur ? styles.bannerContain : styles.bannerBg}
                      src={bannerSrc}
                      alt=""
                      aria-hidden="true"
                      style={
                        c.cover && !c.coverBlur
                          ? {
                              objectPosition: c.coverPos ?? "center 20%",
                              transform: c.coverScale ? `scale(${c.coverScale})` : undefined,
                              transformOrigin: c.coverPos ?? "center 20%",
                            }
                          : undefined
                      }
                    />
                    <div className={styles.bannerScrim} />
                  </>
                )}
                <p className={styles.bannerName}>{c.name}</p>
                <p className={styles.bannerGroup}>{c.group}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* AI 패션 검색 소구 — 이 아이돌이 전부가 아니다, 누구든 검색하면 나온다 */}
      <section className={styles.searchSection}>
        <h2 className={styles.searchHead}>더 많은 셀럽을 찾아보세요</h2>
        <p className={styles.searchSub}>최애 이름만 검색하면 그 사복까지 다 찾아드려요</p>
        {/* 웹 키코의 검색 컴포저(BorderBeam + dockRing + dockIn) 그대로 이식 */}
        <div className={styles.searchComposer}>
          <BorderBeam
            size="md"
            colorVariant="colorful"
            theme="light"
            duration={6}
            strength={1}
            borderRadius={36}
            style={{display: "block"}}
          >
            <div className={`${chatStyles.dockRing} ${styles.searchRing}`}>
              <div className={`${chatStyles.dockIn} ${styles.searchDock}`}>
                <input
                  className="amp-unmask"
                  placeholder="최애 이름을 검색해보세요"
                  autoComplete="off"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch()
                  }}
                />
                <button
                  className={`${chatStyles.sendbtn} ${chatStyles.sendDark} ${searchValue.trim() ? chatStyles.sendReady : ""}`}
                  aria-label="검색"
                  type="button"
                  onClick={submitSearch}
                >
                  <span>↑</span>
                </button>
              </div>
            </div>
          </BorderBeam>
        </div>
      </section>

      {/* 다크 마감 CTA */}
      <section className={styles.closing}>
        <div className={styles.closingInner}>
          <h2 className={styles.closingTitle}>
            매일 올라오는 최애 사복이
            <br />
            궁금하다면?
          </h2>
          <p className={styles.closingSub}>
            지금 키코에 초대받고, 최애처럼 스타일링하세요.
          </p>
          <button className={styles.closingBtn} type="button" onClick={() => openModal("closing")}>
            초대 받기
          </button>
        </div>
      </section>
    </div>
  )
}
