"use client"

import { Suspense, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BorderBeam } from "border-beam"
import styles from "../chat.module.css"
import { XIcon } from "../_components/icons"
import PixelSpinner from "../_components/PixelSpinner"
import ProductPdp, { type PdpTarget } from "../_components/ProductPdp"
import { krw } from "../_lib/mock-products"
import {
  dedupeKey,
  parseStreamCaption,
  startChatStream,
  startMockChatStream,
  type ChatStreamHandlers,
  type ProductRef,
} from "../_lib/chat-stream"
import {
  getActiveChatController,
  getChatStore,
  resetChatStore,
  setActiveChatController,
  setChatStore,
  type ChatTurn,
} from "../_lib/chat-store"
import { EXAMPLES_BY_GENDER } from "../_lib/examples"
import { newRequestId, track } from "@/lib/analytics"

// 라이브 서버 토큰이 준비되기 전까지는 데모 드라이버를 쓴다. /api/chat/stream 프록시와
// 실드라이버(startChatStream)는 완성 상태 — 토큰이 붙으면 이 상수만 true로 바꾸면 된다.
const USE_LIVE = true

// StrictMode 가짜 언마운트와 진짜 이탈을 구분하기 위한 세션 리셋 유예 타이머 (모듈 스코프)
let pendingSessionReset: ReturnType<typeof setTimeout> | null = null

// 같은 브랜드 연속 노출 방지 — 브랜드별 라운드로빈 재배열 (모바일 2열에서 특히 피로).
// 브랜드가 2종 이하면 브랜드 지명 검색으로 보고 서버 순서를 유지한다.
function interleaveByBrand(list: ProductRef[]): ProductRef[] {
  const groups = new Map<string, ProductRef[]>()
  for (const p of list) {
    const b = parseStreamCaption(p.caption).brand || "?"
    const arr = groups.get(b)
    if (arr) arr.push(p)
    else groups.set(b, [p])
  }
  if (groups.size <= 2) return list
  const queues = Array.from(groups.values())
  const out: ProductRef[] = []
  let moved = true
  while (moved) {
    moved = false
    for (const q of queues) {
      const item = q.shift()
      if (item) {
        out.push(item)
        moved = true
      }
    }
  }
  return out
}

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [turns, setTurns] = useState<ChatTurn[]>(() => getChatStore().turns)
  const [dockValue, setDockValue] = useState("")
  // 카드 체크 선택(단일) → 컴포저 위에 핀 칩 + 크리틱 칩("더 비슷하게/더 저렴하게") 노출 (모바일 핀 문법)
  const [selectedPin, setSelectedPin] = useState<{
    key: string
    brand: string
    name: string
    img: string
  } | null>(null)
  const [openPdp, setOpenPdp] = useState<PdpTarget | null>(null)
  // 챗 성별 필터 (빈 상태 히어로 세그) — 스토어 gender 와 동기, 이후 쿼리에 반영
  const [chatGender, setChatGender] = useState<"women" | "men">(getChatStore().gender ?? "women")
  // 일일 사용량 한도 — 리마운트(라우트 이동) 시에도 스토어에서 복원되어 컴포저가 계속 잠긴다.
  const [capReached, setCapReached] = useState(() => getChatStore().capReached)
  // 모달 자체는 닫을 수 있지만(스토어에 저장 안 함), 컴포저 잠금(capReached)은 유지된다.
  const [capModalOpen, setCapModalOpen] = useState(false)
  // 스트림 실패 배너 (모바일 Banner 문법: 컴포저 위 플로팅, 에러 우선, 다시 시도 액션)
  const [errorBanner, setErrorBanner] = useState<{
    title: string
    retryQuery: string
    retryCallback?: { data: string; label: string }
  } | null>(null)

  const initializedRef = useRef(false)
  const mountedRef = useRef(true)
  const lastTurnRef = useRef<HTMLDivElement | null>(null)
  const turnCounterRef = useRef(getChatStore().turnCounter)

  useEffect(() => {
    mountedRef.current = true
    // 직전 언마운트가 React StrictMode(dev)의 가짜 언마운트였다면 예약된 리셋을 취소 —
    // 즉시 리셋하면 explore→chat 핸드오프의 첫 스트림이 시작 직후 abort되어
    // 영원한 로딩만 남는다 (실사용 버그 재현 원인).
    if (pendingSessionReset != null) {
      clearTimeout(pendingSessionReset)
      pendingSessionReset = null
    }
    return () => {
      mountedRef.current = false
      // 세션 정책 (사용자 확정, 모바일과 일치): 챗을 진짜 떠났을 때만 세션 종료.
      // 60ms 유예 — StrictMode 재마운트면 위에서 취소된다. (gender/cap은 보존)
      pendingSessionReset = setTimeout(() => {
        pendingSessionReset = null
        getActiveChatController()?.abort()
        setActiveChatController(null)
        resetChatStore()
      }, 60)
    }
  }, [])

  // 스토어(모듈 스코프)를 유일한 소스로 갱신하고, 마운트 중일 때만 React state도 반영.
  // 백그라운드 스트림 콜백이 언마운트 이후(라우트 이동)에도 스토어에 계속 쓸 수 있게 한다.
  const applyTurns = (next: ChatTurn[]) => {
    setChatStore({ turns: next })
    if (mountedRef.current) setTurns(next)
  }
  const patchTurn = (id: number, patch: Partial<ChatTurn> | ((t: ChatTurn) => Partial<ChatTurn>)) => {
    const next = getChatStore().turns.map((t) =>
      t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
    )
    applyTurns(next)
  }

  // 스트림 진행 중 여부 — 진행 중에는 추가 전송 금지 (사용자 확정: 턴 겹침 방지)
  const streaming = turns.length > 0 && !turns[turns.length - 1].streamDone

  // callback 있으면 clarify 버튼 탭 — 유저 버블엔 label, 서버엔 callback_data (모바일 문법)
  const submit = (q: string, callback?: { data: string; label: string }) => {
    const query = q.trim()
    if (!query) return
    if (getChatStore().capReached) return // 한도 도달 시 컴포저는 disabled지만, 방어적으로 한 번 더 막는다.
    if (getChatStore().turns.some((t) => !t.streamDone)) return // 진행 중 턴 있으면 무시

    getActiveChatController()?.abort()

    const id = turnCounterRef.current
    turnCounterRef.current += 1
    const turn: ChatTurn = {
      id,
      query,
      streamText: "",
      products: [],
      streamDone: false,
      searchTotal: null,
    }
    setChatStore({ turnCounter: turnCounterRef.current })
    applyTurns([...getChatStore().turns, turn])
    setDockValue("")
    setErrorBanner(null)

    // 계측: 검색 제출 = search_query (JTBD 검증 핵심 KPI, 모바일 동일 이벤트명).
    // 실제 스트림 제출 지점 한 곳에서만 발사 — explore 핸드오프도 여기로 수렴해 이중 카운트 없음.
    // request_id는 Langfuse 트레이스 조인용 상관키 (백엔드 전달은 서버 연동 시).
    track("search_query", {
      query,
      request_id: newRequestId(),
      gender: getChatStore().gender,
      is_callback: Boolean(callback),
    })

    const seenKeys = new Set<string>()
    const handlers: ChatStreamHandlers = {
      onSession: (sid) => setChatStore({ sessionId: sid }),
      onTextDelta: (delta) => patchTurn(id, (t) => ({ streamText: t.streamText + delta })),
      onProduct: (p: ProductRef) => {
        const key = dedupeKey(p)
        if (seenKeys.has(key)) return
        seenKeys.add(key)
        patchTurn(id, (t) => ({ products: [...t.products, p] }))
      },
      onSearch: (_searchId, total) => patchTurn(id, { searchTotal: total }),
      onClarify: (payload) => patchTurn(id, { clarify: payload }),
      onCapReached: (payload) => {
        setChatStore({ capReached: true, capResetAt: payload.reset_at })
        if (mountedRef.current) {
          setCapReached(true)
          setCapModalOpen(true)
        }
        patchTurn(id, { streamDone: true })
      },
      // 완료 시 브랜드 라운드로빈 재배열 — 스트리밍 도착 순서(브랜드 뭉침)를 한 번에 정리
      onDone: () => patchTurn(id, (t) => ({ streamDone: true, products: interleaveByBrand(t.products) })),
      onError: (detail) => {
        patchTurn(id, { streamDone: true, error: detail })
        if (mountedRef.current) setErrorBanner({ title: detail, retryQuery: query, retryCallback: callback })
      },
    }

    const driver = USE_LIVE ? startChatStream : startMockChatStream
    const controller = driver(
      {
        message: query,
        gender: getChatStore().gender,
        sessionId: getChatStore().sessionId,
        callback,
      },
      handlers
    )
    setActiveChatController(controller)
  }

  // clarify 버튼 탭: 해당 턴에 pick 기록(음영 이력) 후, label을 유저 버블로 하는 새 턴 스폰.
  // 성별 clarify면 로컬 gender도 동기화해 이후 턴부터 재질문이 없게 한다.
  const pickClarify = (turnId: number, option: { label: string; callback: string }) => {
    patchTurn(turnId, (t) => ({ clarifyPicks: [...(t.clarifyPicks ?? []), option.callback] }))
    const genderMatch = option.callback.match(/gender:(women|men)/)
    if (genderMatch) setChatStore({ gender: genderMatch[1] as "women" | "men" })
    submit(option.label, { data: option.callback, label: option.label })
  }

  // 최초 진입 시 ?q= 로 넘어온 검색어를 첫 턴으로 제출 (explore → chat 핸드오프).
  // 제출 후 즉시 쿼리스트링을 지워 재제출을 막고, lastHandledQ로 이중 방어한다.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    // 히어로 성별 토글 값(?g=women|men)을 스토어에 먼저 반영 — 서버 재질문 방지
    const g = searchParams.get("g")
    if (g === "women" || g === "men") {
      setChatStore({ gender: g })
      setChatGender(g)
    }
    const q = searchParams.get("q")
    if (!q || !q.trim()) return
    if (getChatStore().lastHandledQ === q) return
    setChatStore({ lastHandledQ: q })
    submit(q)
    router.replace("/chat")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 새 턴이 추가되면 부드럽게 스크롤 (mockup: setTimeout(...,50))
  useEffect(() => {
    if (turns.length === 0) return
    const t = setTimeout(() => {
      lastTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
    return () => clearTimeout(t)
  }, [turns.length])

  // cap 모달 열림/닫힘: body 스크롤 잠금 + Esc 닫기.
  // PDP 쪽 잠금/Esc는 ProductPdp가 자체 관리 — 둘이 겹치면 cap 모달이 Esc 우선권을 가지므로
  // ProductPdp에 escDisabled={capModalOpen}을 내려 양보시킨다.
  useEffect(() => {
    if (!capModalOpen) return
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCapModalOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [capModalOpen])

  // 독 제출 — 핀 선택 상태면 그 상품 기준으로 리파인 ("어떻게 바꿔드릴까요?" 플레이스홀더와 세트)
  const submitDock = () => {
    const text = dockValue.trim()
    if (!text) return
    if (selectedPin) {
      submit(`${selectedPin.name || selectedPin.brand} 기준으로 ${text}`)
      setSelectedPin(null)
    } else {
      submit(text)
    }
  }

  const onDockKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중 Enter는 무시 — 조합 문자("만" 등)가 별도 턴으로 이중 제출되는 버그 방지
    if (e.nativeEvent.isComposing) return
    if (e.key === "Enter" && dockValue.trim() && !capReached && !streaming) submitDock()
  }

  // 단일 선택 토글 — 선택된 카드가 컴포저 핀 칩이 된다 (같은 카드 재탭 = 해제)
  const togglePin = (key: string, info: { brand: string; name: string; img: string }) => {
    setSelectedPin((prev) => (prev?.key === key ? null : { key, ...info }))
  }

  return (
    <>
      <section className={styles.convo}>
        {/* 빈 상태 미니 히어로 (daydream 문법: 빈 챗에도 히어로·예시가 따라온다) — 카피 드래프트 */}
        {turns.length === 0 && (
          <div className={styles.emptyHero}>
            <h2 className={styles.emptyTitle}>무엇을 찾아볼까요?</h2>
            <p className={styles.emptySub}>5,000+ 브랜드에서 바로 찾아드려요</p>
            <div className={styles.seg}>
              <button
                type="button"
                className={chatGender === "women" ? styles.segOn : undefined}
                onClick={() => {
                  setChatGender("women")
                  setChatStore({ gender: "women" })
                }}
              >
                여성
              </button>
              <button
                type="button"
                className={chatGender === "men" ? styles.segOn : undefined}
                onClick={() => {
                  setChatGender("men")
                  setChatStore({ gender: "men" })
                }}
              >
                남성
              </button>
            </div>
            <div className={styles.emptyChips}>
              {(chatGender === "men" ? EXAMPLES_BY_GENDER.male : EXAMPLES_BY_GENDER.female)
                .slice(0, 5)
                .map((q) => (
                  <button
                    key={q}
                    className={`${styles.chip} ${styles.chipGlass}`}
                    type="button"
                    onClick={() => submit(q)}
                  >
                    {q}
                  </button>
                ))}
            </div>
          </div>
        )}
        {turns.map((turn, ti) => {
          const isLast = ti === turns.length - 1
          const paragraphs = turn.streamText.split(/\n{2,}/).filter((p) => p.trim().length > 0)
          // 모바일 문법: 상품 첫 장이 도착하기 전까지 스피너 유지 (텍스트가 먼저 와도)
          const showLoading =
            !turn.streamDone && turn.products.length === 0 && !turn.error && !turn.clarify

          return (
            <div key={turn.id} className={styles.turn} ref={isLast ? lastTurnRef : undefined}>
              <div className={styles.userrow}>
                <span className={styles.userbubble}>{turn.query}</span>
              </div>

              {turn.error && paragraphs.length === 0 && <div className={styles.agent}>{turn.error}</div>}

              {paragraphs.map((para, pi) => (
                <div key={pi} className={styles.agent}>
                  {para}
                </div>
              ))}

              {showLoading && (
                <div className={styles.loadingRow}>
                  <PixelSpinner pixelSize={4} />
                  <span className={styles.shimmerText}>키코가 5,000+ 패션 브랜드에서 찾는 중</span>
                </div>
              )}

              {turn.products.length > 0 && (
                <div className={styles.grid}>
                  {turn.products.map((p, ci) => {
                    const parsed = parseStreamCaption(p.caption)
                    const key = `${turn.id}-${ci}`
                    const isPinned = selectedPin?.key === key
                    return (
                      <div
                        key={key}
                        className={styles.pcard}
                        style={{ animationDelay: `${ci * 0.03}s` }}
                        onClick={() => {
                          if (p.product_id == null) return
                          setOpenPdp({
                            id: p.product_id,
                            fallback: {
                              brand: parsed.brand,
                              name: parsed.name,
                              price: parsed.price,
                              img: p.image_url,
                            },
                          })
                        }}
                      >
                        <div className={styles.thumb}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            loading="lazy"
                            src={p.image_url}
                            alt={parsed.name || parsed.brand}
                            onError={(e) => {
                              e.currentTarget.style.opacity = "0"
                            }}
                          />
                          {/* 선택 버튼 하나 (X·하트 제거, 사용자 확정) — 블랙 체크,
                              선택 시 블랙 필 + 흰 체크 + 약한 보더빔 링 */}
                          {isPinned ? (
                            <span className={styles.pinBeamWrap} onClick={(e) => e.stopPropagation()}>
                              <BorderBeam
                                size="line"
                                colorVariant="colorful"
                                theme="light"
                                duration={4}
                                strength={0.45}
                                borderRadius={999}
                              >
                                <button
                                  className={`${styles.ovl} ${styles.pin} ${styles.pinOn} ${styles.pinStatic}`}
                                  aria-label="상품 선택 해제"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePin(key, {
                                      brand: parsed.brand,
                                      name: parsed.name,
                                      img: p.image_url,
                                    })
                                  }}
                                >
                                  <GradientCheckIcon size={16} />
                                </button>
                              </BorderBeam>
                            </span>
                          ) : (
                            <button
                              className={`${styles.ovl} ${styles.pin}`}
                              aria-label="상품 선택"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePin(key, {
                                  brand: parsed.brand,
                                  name: parsed.name,
                                  img: p.image_url,
                                })
                              }}
                            >
                              <GradientCheckIcon size={16} />
                            </button>
                          )}
                        </div>
                        <div className={styles.pmeta}>
                          <div className={styles.pbrand}>{parsed.brand}</div>
                          <div className={styles.pname}>{parsed.name}</div>
                          <div className={styles.pprice}>{krw(parsed.price)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {turn.clarify && (
                <div className={styles.refine}>
                  {turn.clarify.options.map((o) => {
                    const picked = turn.clarifyPicks?.includes(o.callback) ?? false
                    return (
                      <button
                        key={o.callback}
                        className={`${styles.chip} ${picked ? styles.chipPicked : ""}`}
                        type="button"
                        disabled={picked || capReached}
                        onClick={() => pickClarify(turn.id, o)}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              )}

            </div>
          )
        })}
      </section>

      {/* 스트림 실패 배너 — 모바일 Banner 이식: 컴포저 위 플로팅 다크 서피스 + 다시 시도 */}
      {errorBanner && (
        <div className={styles.errBanner} role="alert">
          <div className={styles.errBannerText}>
            <strong>{errorBanner.title}</strong>
            <span>다시 시도해주세요</span>
          </div>
          <button
            type="button"
            className={styles.errBannerRetry}
            onClick={() => {
              const { retryQuery, retryCallback } = errorBanner
              setErrorBanner(null)
              submit(retryQuery, retryCallback)
            }}
          >
            다시 시도
          </button>
          <button
            type="button"
            className={styles.errBannerClose}
            aria-label="닫기"
            onClick={() => setErrorBanner(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.dock}>
        {/* 핀 선택 시 컴포저 위 칩 행 — 핀 칩(썸네일+이름+해제) + 크리틱 칩 (모바일 문법) */}
        {selectedPin && !capReached && (
          <div className={styles.dockChips}>
            <span className={styles.dockPinned}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedPin.img} alt="" />
              <span className={styles.dockPinnedName}>{selectedPin.name || selectedPin.brand}</span>
              <button
                type="button"
                aria-label="선택 해제"
                onClick={() => setSelectedPin(null)}
              >
                <XIcon size={11} />
              </button>
            </span>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipGlass}`}
              disabled={streaming}
              onClick={() => submit(`${selectedPin.name || selectedPin.brand}랑 비슷한 스타일 찾아줘`)}
            >
              더 비슷하게
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipGlass}`}
              disabled={streaming}
              onClick={() =>
                submit(`${selectedPin.name || selectedPin.brand}보다 더 저렴한 걸로 찾아줘`)
              }
            >
              더 저렴하게
            </button>
          </div>
        )}
        <div className={styles.dockRow}>
          {/* colorVariant는 한 줄만 바꾸면 되도록 유지 (현재: colorful, violet→warm 애니메이션).
              상품 선택 시엔 펄스 + 채도/밝기 업으로 컴포저를 강하게 활성화 (사용자 확정) */}
          <BorderBeam
            size={selectedPin ? "pulse-outside" : "md"}
            colorVariant="colorful"
            theme="light"
            duration={selectedPin ? 4 : 6}
            strength={1}
            saturation={selectedPin ? 1.4 : undefined}
            brightness={selectedPin ? 1.15 : undefined}
            borderRadius={36}
            style={{ flex: 1 }}
          >
            {/* daydream 컴포저 문법: 바깥 리퀴드글래스 링(뒤 콘텐츠 비침) + 안쪽 불투명 흰 필드.
                이미지 첨부는 보류 — 텍스트 검색만 (사용자 확정) */}
            <div className={styles.dockRing}>
            <div className={`${styles.dockIn} ${capReached ? styles.dockInLocked : ""}`}>
              <input
                className="amp-unmask"
                placeholder={
                  capReached
                    ? "내일 다시 검색할 수 있어요"
                    : selectedPin
                      ? "어떻게 바꿔드릴까요?"
                      : "이어서 물어보세요"
                }
                autoComplete="off"
                value={dockValue}
                disabled={capReached}
                onChange={(e) => setDockValue(e.target.value)}
                onKeyDown={onDockKeyDown}
              />
              <button
                className={`${styles.sendbtn} ${styles.sendDark} ${
                  dockValue.trim() && !capReached && !streaming ? styles.sendReady : ""
                }`}
                aria-label="검색"
                type="button"
                disabled={capReached || streaming}
                onClick={submitDock}
              >
                <span>↑</span>
              </button>
            </div>
            </div>
          </BorderBeam>
          <button
            className={styles.plusbtn}
            aria-label="새 검색"
            title="새 검색"
            type="button"
            onClick={() => {
              getActiveChatController()?.abort()
              setActiveChatController(null)
              resetChatStore()
              turnCounterRef.current = 0
              setTurns([])
              router.push("/explore")
            }}
          >
            <span aria-hidden="true">+</span>
            <span className={styles.plusbtnLabel}>새 검색</span>
          </button>
        </div>
      </div>

      <ProductPdp
        target={openPdp}
        escDisabled={capModalOpen}
        onClose={() => setOpenPdp(null)}
        onRequery={(name, mode) => {
          // 재쿼리: 모달 닫고 챗에 새 턴으로 제출 (기존 앱 "이 상품에서 새로 검색" 문법)
          setOpenPdp(null)
          submit(
            mode === "cheaper"
              ? `${name}보다 더 저렴한 걸로 찾아줘`
              : `${name}랑 비슷한 스타일 찾아줘`
          )
        }}
      />

      {/* 사용량 한도 모달 — 콘텐츠 시트는 불투명(HIG: 글래스는 컨트롤 레이어 전용).
          백드롭 클릭·Esc·닫기 버튼으로 닫히지만, 컴포저 잠금(capReached)은 유지된다. */}
      <div
        className={`${styles.capModal} ${capModalOpen ? styles.capModalOn : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCapModalOpen(false)
        }}
      >
        <div className={styles.capSheet}>
          {/* 카피 드래프트 — 확정 전 임시 문구 */}
          <div className={styles.capTitle}>오늘 사용량을 모두 썼어요</div>
          <div className={styles.capSubtitle}>검색은 내일 다시 열려요. 앱에서는 지금 바로 이어서 볼 수 있어요.</div>
          <a className={styles.capCta} href="#">
            앱에서 열기
          </a>
          <button type="button" className={styles.capCloseBtn} onClick={() => setCapModalOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    </>
  )
}

// 카드 선택 체크 — 블랙(label). 선택 상태(plain)에서는 흰 체크 (배경이 블랙 필이 되므로).
function GradientCheckIcon({ size = 16, plain = false }: { size?: number; plain?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 12.5 5 5 10-11" stroke={plain ? "#fff" : "#1c1c1e"} />
    </svg>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
