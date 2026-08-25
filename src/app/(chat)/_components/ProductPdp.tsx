"use client"

import { useEffect, useRef, useState } from "react"
import styles from "../chat.module.css"
import { XIcon, ExternalArrowIcon } from "./icons"
import { krw } from "../_lib/mock-products"
import { fetchProductDetail, type ProductDetail } from "../_lib/chat-stream"
import { track } from "@/lib/analytics"

// chat/page.tsx 인라인 PDP를 그대로 추출한 공용 컴포넌트 (챗 + 파인더 양쪽 사용).
// 스타일은 기존 chat.module.css 클래스를 그대로 사용 — 동작·외형 1:1 유지가 계약이다.
//
// - 백드롭 클릭/Esc 닫기, body 스크롤 잠금, 시트 스크롤 리셋을 자체 관리한다.
//   (챗의 cap 모달처럼 Esc 우선권이 다른 모달에 있을 땐 escDisabled 로 양보)
// - 비슷한 상품 셸프 체인(셸프 카드 탭 → 그 상품 PDP로 교체)은 내부 상태로 처리 —
//   부모가 내려준 target 이 바뀌면 체인은 리셋된다.

// PDP 오픈 타깃 — 상세는 fetch로 채우고, 도착 전까지 카드에서 넘어온 fallback으로 렌더
export interface PdpTarget {
  id: number
  fallback: { brand: string; name: string; price: number | null; img: string }
}

export default function ProductPdp({
  target,
  onClose,
  onRequery,
  escDisabled = false,
}: {
  target: PdpTarget | null
  onClose: () => void
  onRequery: (name: string, mode: "similar" | "cheaper") => void
  /** 다른 모달(챗 cap 모달 등)이 Esc 우선권을 가질 때 true — PDP는 Esc를 무시 */
  escDisabled?: boolean
}) {
  const pdpSheetRef = useRef<HTMLDivElement | null>(null)
  // 비슷한 상품 셸프 체인 — 부모 state를 건드리지 않고 내부에서 타깃 교체
  const [chainTarget, setChainTarget] = useState<PdpTarget | null>(null)
  // 부모가 새 타깃을 열면 체인 초기화 — 렌더 중 파생 state 리셋 패턴 (effect 캐스케이드 회피)
  const [prevTarget, setPrevTarget] = useState<PdpTarget | null>(target)
  if (target !== prevTarget) {
    setPrevTarget(target)
    setChainTarget(null)
  }
  const effective = chainTarget ?? target

  // 최신 onClose를 ref로 유지 — 렌더마다 리스너 재부착 없이 Esc 핸들러에서 참조
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // 열림/닫힘: body 스크롤 잠금 + Esc 닫기 (chat/page.tsx 원본 effect에서 이동)
  useEffect(() => {
    if (!effective) return
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !escDisabled) onCloseRef.current()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [effective, escDisabled])

  useEffect(() => {
    if (effective && pdpSheetRef.current) pdpSheetRef.current.scrollTop = 0
  }, [effective])

  return (
    <>
      {/* 백드롭 클릭 닫기 (mockup: pdp.addEventListener("click", e=>{if(e.target===pdp) closePDP()})) */}
      <div
        className={`${styles.pdp} ${effective ? styles.pdpOn : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className={styles.pdpSheet} ref={pdpSheetRef}>
          {effective && (
            <PdpBody
              key={effective.id}
              target={effective}
              onClose={onClose}
              onOpen={setChainTarget}
              onRequery={onRequery}
            />
          )}
        </div>
      </div>
    </>
  )
}

// 애플 문법 PDP — App Store 확장 카드 + apple.com 구매 페이지 그램마:
// 순백 갤러리(닷 인디케이터) | eyebrow 브랜드 → 타이틀 상품명 → 세일가+정가취소선 →
// 주(Buy 검정)·부(재쿼리 회색) 버튼 위계 → 하단 풀폭 셸프(비슷한 상품).
// 상세는 GET /v1/products/{id} (프록시)에서 채운다 — 도착 전엔 카드 fallback으로 즉시 렌더.
function PdpBody({
  target,
  onClose,
  onOpen,
  onRequery,
}: {
  target: PdpTarget
  onClose: () => void
  onOpen: (t: PdpTarget) => void
  onRequery: (name: string, mode: "similar" | "cheaper") => void
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [slide, setSlide] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    // 계측: PDP 열림 = product_view (모바일 동일 이벤트명, 챗·파인더 공용 발사 지점)
    track("product_view", { product_id: target.id, brand: target.fallback.brand })
    fetchProductDetail(target.id).then((d) => {
      if (alive && d) setDetail(d)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id])

  const brand = detail?.brand ?? target.fallback.brand
  const name = detail?.name ?? target.fallback.name
  const shownPrice = detail ? detail.sale_price ?? detail.price : target.fallback.price
  const originalPrice = detail?.original_price ?? null
  const images =
    detail?.images && detail.images.length > 0 ? detail.images : [detail?.image_url ?? target.fallback.img]
  const buyUrl = detail?.product_url ?? null
  const sims = detail?.similar ?? []

  return (
    <>
      <button className={styles.pdpClose} aria-label="닫기" type="button" onClick={onClose}>
        <XIcon size={17} />
      </button>
      {/* 애플 스토어 퀵룩 실물 문법: 닷=이미지 아래 / CTA=타이틀 줄 우측 컴팩트 캡슐 /
          액션=hairline 행 리스트 (iPad Pro 퀵룩 레퍼런스 1:1) */}
      <div className={styles.pdpTop}>
        <div className={styles.pdpGalleryCol}>
          <div className={styles.pdpGallery}>
            <div
              className={styles.pdpGalleryTrack}
              ref={trackRef}
              onScroll={(e) => {
                const el = e.currentTarget
                setSlide(Math.round(el.scrollLeft / el.clientWidth))
              }}
            >
              {images.map((src, i) => (
                <div key={i} className={styles.pdpSlide}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${name} ${i + 1}`}
                    onError={(e) => {
                      e.currentTarget.style.opacity = "0"
                    }}
                  />
                </div>
              ))}
            </div>
            {/* 다음 이미지 화살표 — 마지막 장에서는 숨김. 스냅은 1장씩(scroll-snap-stop) */}
            {images.length > 1 && slide < images.length - 1 && (
              <button
                className={styles.pdpArrow}
                aria-label="다음 이미지"
                type="button"
                onClick={() => {
                  const el = trackRef.current
                  if (el) el.scrollTo({ left: (slide + 1) * el.clientWidth, behavior: "smooth" })
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
          {images.length > 1 && (
            <div className={styles.pdpDots}>
              {images.map((_, i) => (
                <span key={i} className={i === slide ? styles.pdpDotOn : styles.pdpDot} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.pdpInfo}>
          <div className={styles.pdpEyebrow}>{brand}</div>
          <div className={styles.pdpTitle}>{name}</div>
          {/* 가격 노출 정책 (모바일 동일): PDP = %[현재가][정가취소선] */}
          <div className={styles.pdpPriceRow}>
            {originalPrice != null && shownPrice != null && originalPrice > shownPrice && (
              <span className={styles.pdpDiscount}>
                {Math.round((1 - shownPrice / originalPrice) * 100)}%
              </span>
            )}
            <span className={styles.pdpPrice}>{krw(shownPrice)}</span>
            {originalPrice != null && shownPrice != null && originalPrice > shownPrice && (
              <span className={styles.pdpPriceOld}>{krw(originalPrice)}</span>
            )}
          </div>
          {/* Buy 1줄 → 빠른 재쿼리 2버튼 1줄 (클릭 시 모달 닫고 재쿼리 핸들러로).
              상세 도착 전에는 구매 링크가 없으므로 Buy 를 비활성 톤으로 */}
          {buyUrl ? (
            <a
              className={styles.pdpCta}
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                // 계측: 외부몰 이동 = outbound_click (인게이지먼트 KPI 분자)
                track("outbound_click", { product_id: target.id, brand, url: buyUrl })
              }
            >
              Buy <ExternalArrowIcon size={15} />
            </a>
          ) : (
            <span className={`${styles.pdpCta} ${styles.pdpCtaDisabled}`}>
              Buy <ExternalArrowIcon size={15} />
            </span>
          )}
          <div className={styles.pdpCta2Row}>
            <button
              className={styles.pdpCta2}
              type="button"
              onClick={() => onRequery(name, "cheaper")}
            >
              더 저렴하게
            </button>
            <button
              className={styles.pdpCta2}
              type="button"
              onClick={() => onRequery(name, "similar")}
            >
              더 비슷하게
            </button>
          </div>
        </div>
      </div>
      {sims.length > 0 && (
        <div className={styles.pdpShelfWrap}>
          <div className={styles.pdpSimLabel}>비슷한 상품</div>
          <div className={styles.pdpShelf}>
            {sims.map((s) => (
              <a
                key={s.id}
                className={styles.pdpShelfCard}
                onClick={(e) => {
                  e.preventDefault()
                  onOpen({
                    id: s.id,
                    fallback: {
                      brand: s.brand,
                      name: s.name,
                      price: s.sale_price ?? s.price,
                      img: s.image_url,
                    },
                  })
                }}
              >
                <div className={styles.thumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    src={s.image_url}
                    alt={s.name}
                    onError={(e) => {
                      e.currentTarget.style.opacity = "0"
                    }}
                  />
                </div>
                <div className={styles.sb}>{s.brand}</div>
                <div className={styles.sn}>{s.name}</div>
                {/* 가격 노출 정책 (모바일 동일): 썸네일 = %[현재가] (정가 미노출) */}
                <div className={styles.sp}>
                  {(() => {
                    const sale = s.sale_price ?? s.price
                    const orig = s.original_price
                    return (
                      <>
                        {orig != null && orig > sale && (
                          <span className={styles.spPct}>{Math.round((1 - sale / orig) * 100)}% </span>
                        )}
                        {krw(sale)}
                      </>
                    )
                  })()}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
