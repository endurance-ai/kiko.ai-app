"use client"

import {use, useRef, useState} from "react"
import {notFound} from "next/navigation"
import styles from "../../celeb.module.css"
import {getCeleb, coverOf, won, type Item, type Look} from "../../_celebs"
import {useWaitlist} from "../../_Waitlist"
import {trackCeleb} from "../../_track"

// ── 셀럽 상세 (/celeb/[id]) — Plush식 구조, 룩마다 섹션 ───────────────────────
// 셀럽 히어로 → [룩: 번호+스타일 타이틀 → 폴라로이드 룩 사진+출처 → 설명 → 제품 그리드(착용옷+비슷한옷 2줄)] × N → 이메일.
// 제품카드 이미지/비슷한옷은 추후 Figma·실데이터 교체(현재 착용옷=실측 텍스트, 비슷한옷=골격).
// 헤더/뒤로가기 없음 — 웹은 브라우저 뒤로가기로 충분.

// 채워진 하트 아이콘 — 파인더 카드(FinderSection HEART)와 동일
const HEART = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l7.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

// 잠금 글리프 — SF Symbols lock.fill 느낌 (페이월 배지)
const LOCK = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.6a5.4 5.4 0 0 0-5.4 5.4v2.2H5.9A2.4 2.4 0 0 0 3.5 11.6v7.6a2.4 2.4 0 0 0 2.4 2.4h12.2a2.4 2.4 0 0 0 2.4-2.4v-7.6a2.4 2.4 0 0 0-2.4-2.4h-.7V7A5.4 5.4 0 0 0 12 1.6zm3.1 7.6H8.9V7a3.1 3.1 0 0 1 6.2 0z" />
  </svg>
)

// 상품 카드 — 파인더 카드(.card/.thumb/.save/.meta) 1:1 이식. worn=착용 태그.
// 카드 전체가 구매 페이지로 이동, 하트는 이메일 모달(fake-door).
function ProductCard({
  item,
  worn,
  onHeart,
  celebId,
  lookId,
}: {
  item: Item
  worn?: boolean
  onHeart: () => void
  celebId: string
  lookId: string
}) {
  const pct =
    item.priceOld && item.price && item.priceOld > item.price
      ? Math.round((1 - item.price / item.priceOld) * 100)
      : null
  const inner = (
    <>
      <div className={styles.thumb}>
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={`${item.brand} ${item.name}`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.opacity = "0"
            }}
          />
        ) : null}
        {worn ? <span className={styles.wornTag}>착용</span> : null}
        <button
          className={styles.save}
          type="button"
          aria-label="이메일 받기"
          onClick={(e) => {
            e.preventDefault()
            onHeart()
          }}
        >
          {HEART}
        </button>
      </div>
      <div className={styles.meta}>
        <div className={styles.mBrand}>{item.brand}</div>
        <div className={styles.mName}>{item.name}</div>
        {item.price != null ? (
          <div className={styles.mPrice}>
            {pct != null ? <span className={styles.mDiscount}>{pct}%</span> : null}
            {won(item.price)}
          </div>
        ) : null}
      </div>
    </>
  )
  return item.url ? (
    <a
      className={styles.prodCard}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackCeleb("product_click", {
          celeb: celebId,
          look: lookId,
          type: worn ? "worn" : "rec", // 착용템 vs 대체품 (A/C 브리지 신호)
          brand: item.brand,
          product_id: item.id ?? null,
        })
      }
    >
      {inner}
    </a>
  ) : (
    <div className={styles.prodCard}>{inner}</div>
  )
}

// 비슷한 옷 카드 골격 (실데이터 없을 때 폴백)
function SimilarCardSkeleton({onHeart}: {onHeart: () => void}) {
  return (
    <div className={styles.prodCard}>
      <div className={styles.thumb}>
        <button className={styles.save} type="button" onClick={onHeart} aria-label="이메일 받기">
          {HEART}
        </button>
      </div>
      <div className={styles.meta}>
        <span className={`${styles.mBar} ${styles.barBrand}`} />
        <span className={`${styles.mBar} ${styles.barName}`} />
        <span className={`${styles.mBar} ${styles.barPrice}`} />
      </div>
    </div>
  )
}

// 옆으로 넘기는 룩 갤러리 — PDP(PdpBody)의 캐러셀 패턴 1:1.
// flex-basis는 div 래퍼(.lookSlide)에 걸고 img는 그 안에 — Safari 세로쌓임 방지.
function LookGallery({photos, alt}: {photos: string[]; alt: string}) {
  const [slide, setSlide] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className={styles.lookGalleryCol}>
      <div
        className={styles.lookGallery}
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget
          setSlide(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {photos.map((src, i) => (
          <div key={src} className={styles.lookSlide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${alt} ${i + 1}`}
              loading="lazy"
              draggable={false}
              onError={(e) => {
                e.currentTarget.style.opacity = "0"
              }}
            />
          </div>
        ))}
      </div>
      <div className={styles.lookDots}>
        {photos.map((_, i) => (
          <span key={i} className={i === slide ? styles.lookDotOn : styles.lookDot} />
        ))}
      </div>
    </div>
  )
}

function LookSection({
  look,
  index,
  celebId,
  celebName,
  grad,
  onHeart,
}: {
  look: Look
  index: number
  celebId: string
  celebName: string
  grad: string
  onHeart: () => void
}) {
  // 훅은 조기 return보다 위에서 무조건 호출 (rules-of-hooks)
  const [expanded, setExpanded] = useState(false)

  // 페이월 룩(teaser) — 형제 룩과 동일한 번호+타이틀 헤더 + 사진.
  // 페이지 하단 전체 그라데이션(PageGate)이 이 섹션을 덮어 "위에서 잘렸다"는 느낌을 준다.
  if (look.teaser) {
    return (
      <section className={styles.softBox}>
        <div className={styles.lookTitleRow}>
          <span className={styles.lookNum}>{index + 1}</span>
          <h2 className={styles.lookTitle}>{look.title}</h2>
        </div>
        {look.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.lookImg} src={look.photo} alt={`${celebName} 사복`} />
        ) : (
          <div className={styles.lookImg} style={{background: grad}} />
        )}
      </section>
    )
  }

  // 그리드 = 착용 옷(상단) + 비슷한 옷 전체(recs + moreRecs 합침).
  // 처음 4개만 선노출, 나머지는 더보기/접기로. 실데이터 없으면 스켈레톤 채움.
  const INITIAL = 4
  const alts = [...(look.recs ?? []), ...(look.moreRecs ?? [])]
  const all = [
    ...look.items.map((item) => ({item, worn: true})),
    ...alts.map((item) => ({item, worn: false})),
  ]
  const hasProducts = look.items.length > 0 || alts.length > 0
  const hasReal = alts.length > 0 || look.items.some((i) => i.image)
  const shown = expanded ? all : all.slice(0, INITIAL)
  const skeletons = hasReal ? 0 : Math.max(2, 4 - look.items.length)
  return (
    <section className={styles.softBox}>
      {/* 그룹 섹션 헤더 — 번호 + 스타일 타이틀 (애플 SF, 박스 제거) */}
      <div className={styles.lookTitleRow}>
        <span className={styles.lookNum}>{index + 1}</span>
        <h2 className={styles.lookTitle}>{look.title}</h2>
      </div>

      {/* 룩 사진 — 여러 장이면 옆으로 넘기는 스와이프 갤러리, 한 장이면 단일, 없으면 그라데이션 */}
      {look.photos && look.photos.length > 1 ? (
        <LookGallery photos={look.photos} alt={`${celebName} ${look.occasion} 사복`} />
      ) : look.photo || look.photos?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.lookImg}
          src={look.photo ?? look.photos![0]}
          alt={`${celebName} ${look.occasion} 사복`}
        />
      ) : (
        <div className={styles.lookImg} style={{background: grad}} />
      )}
      {/* 설명 */}
      <p className={styles.lookBlurb}>{look.blurb}</p>

      {/* 제품 그리드 — 상품이 있는 룩만. 처음 4개 선노출(착용 옷 우선), 나머지는 더보기로 펼침 */}
      {hasProducts && (
        <>
          <div className={styles.recGrid}>
            {shown.map(({item, worn}) => (
              <ProductCard
                key={item.brand + item.name}
                item={item}
                worn={worn}
                onHeart={onHeart}
                celebId={celebId}
                lookId={look.id}
              />
            ))}
            {Array.from({length: skeletons}).map((_, n) => (
              <SimilarCardSkeleton key={n} onHeart={onHeart} />
            ))}
          </div>

          {/* 더보기 / 접기 — 애플 디스클로저 토글 (systemBlue 텍스트 + 회전 셰브런) */}
          {all.length > INITIAL && (
            <button
              className={styles.moreBtn}
              type="button"
              onClick={() => {
                if (!expanded) trackCeleb("alts_expand", {celeb: celebId, look: look.id}) // 대체품 더 보려는 신호
                setExpanded((v) => !v)
              }}
              aria-expanded={expanded}
            >
              {expanded ? "접기" : "더보기"}
              <svg
                className={`${styles.moreChev} ${expanded ? styles.moreChevUp : ""}`}
                width="12"
                height="8"
                viewBox="0 0 12 8"
                fill="none"
                aria-hidden="true"
              >
                <path d="M1 1.5l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function CelebDetail({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params)
  const openWaitlist = useWaitlist()
  const celeb = getCeleb(id)
  if (!celeb) notFound()
  const cover = coverOf(celeb)
  const heroSrc = celeb.cover ?? cover.photo
  const onHeart = () => openWaitlist(celeb.id, "heart")
  // 페이월 CTA는 현재 셀럽을 프리필하지 않음 — 사용자가 원하는 셀럽을 직접 입력
  const onUnlock = () => openWaitlist(undefined, "paywall")

  return (
    <div className={`${styles.page} ${styles.detailPage}`}>
      {/* 상세는 헤더/뒤로가기 없음 — 웹은 브라우저 뒤로가기로 충분 */}

      {/* 셀럽 히어로 */}
      <section className={styles.dHero}>
        {heroSrc ? (
          <>
            {celeb.coverBlur && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.dHeroBlur} src={heroSrc} alt="" aria-hidden="true" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={celeb.coverBlur ? styles.dHeroContain : styles.dHeroImg}
              src={heroSrc}
              alt={`${celeb.name} 사복`}
              style={
                celeb.coverBlur
                  ? undefined
                  : {
                      objectPosition: celeb.coverPos ?? "center 15%",
                      transform: celeb.coverScale ? `scale(${celeb.coverScale})` : undefined,
                      transformOrigin: celeb.coverPos ?? "center 15%",
                    }
              }
            />
          </>
        ) : (
          <div className={styles.dHeroImg} style={{background: celeb.grad}} />
        )}
        <div className={styles.dHeroScrim} />
        <div className={styles.dHeroText}>
          <h1 className={styles.dHeroName}>{celeb.name}</h1>
          <p className={styles.dHeroGroup}>{celeb.group}</p>
        </div>
      </section>

      {/* 스타일 소개 + 룩마다 섹션 (소프트 박스) */}
      <div className={styles.dBody}>
        <section className={styles.softBox}>
          <p className={styles.styleText}>{celeb.styleIntro}</p>
        </section>
        {celeb.looks.map((look, i) => (
          <LookSection
            key={look.id}
            look={look}
            index={i}
            celebId={celeb.id}
            celebName={celeb.name}
            grad={celeb.grad}
            onHeart={onHeart}
          />
        ))}
      </div>

      {/* 페이지 하단 그라데이션 게이트 — teaser 룩이 있으면 페이지 전체 폭이 아래로 갈수록
          배경색으로 사라져 "위에서 잘렸다"는 느낌. CTA는 위쪽(대략 얼굴 높이)에 띄운다. */}
      {celeb.looks.some((l) => l.teaser) && (
        <div className={styles.pageGate} aria-hidden={false}>
          <div className={styles.pageGateCta}>
            <span className={styles.pageGateGlyph}>{LOCK}</span>
            <p className={styles.pageGateLead}>더 많은 셀럽의 사복 정보가 궁금하다면?</p>
            <p className={styles.pageGateSub}>착용템부터 더 저렴한 대체품까지</p>
            <button className={styles.pageGateBtn} type="button" onClick={onUnlock}>
              초대받고 열어보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
