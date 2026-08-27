"use client"

import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useRouter } from "next/navigation"
import styles from "../finder.module.css"
import ProductPdp, { type PdpTarget } from "./ProductPdp"
import { CAT_IMG, NAV, SUBATTR, STYLES, GENDER_TO_API, STYLE_NODE_CODES, STYLE_GATE_TAGS, resolveNavQuery, type FinderApiProduct, type FinderApiResponse } from "../_lib/finder-data"
import { krw } from "../_lib/mock-products"

// Ported 1:1 from finder-mockup/finder.html (FINAL approved finder design) for nav/header
// layout and the collection-save (하트) flow. Excludes the mockup's own nav/header (rotating
// promo message, search field, 컬렉션 counter link, brands link) and its gender <select> — the
// (chat) Nav replaces the header, and gender is a prop here so the section resets its
// category/품목/속성 selection whenever it changes.
//
// The grid itself is no longer mock data: it fetches GET /api/web-finder/products (웹랜딩 전용
// pg 직쿼리 라우트 — supabase 기반 /api/finder/products 는 이 환경에 DB_URL 이 없어 500이라
// domains/finder 는 그대로 두고 별도 라우트) and re-queries whenever
// gender/카테고리/품목/브랜드검색/정렬 changes. See
// ../_lib/finder-data.ts (resolveNavQuery, NAV_CATEGORY_QUERY, SUBCATEGORY_MAP) for how the
// Korean nav labels here map onto that API's English category/subcategory params, including the
// two documented taxonomy gaps (니트, 모자).
//
// 스타일 필(프렌치시크 등)은 실필터 — STYLE_NODE_CODES 로 노드 코드를 풀어 nodes 파라미터로
// 재쿼리한다 (브랜드 레벨: brand_nodes primary/secondary → products.brand_node_id).
// 품목별 속성(subsubrow) 칩도 실필터 — SUBATTR 축(label→attrKey/attrValue)을 attrKey/attrValue
// 파라미터로 보내 product_features_v26(VLM v2.6) EXISTS 필터로 걸러진다.

const HEART = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l7.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

type SortOption = "newest" | "price_asc" | "price_desc"
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "price_asc", label: "저가순" },
  { value: "price_desc", label: "고가순" },
]

interface Collection {
  name: string
  items: Set<string>
}

// 같은 브랜드 연속 노출 방지 — 브랜드별 라운드로빈 재배열 (크롤 배치가 브랜드 단위라
// newest 정렬에서 특히 뭉침). 브랜드 검색 중에는 적용하지 않는다.
function interleaveByBrand<T extends { brand: string }>(list: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const p of list) {
    const arr = groups.get(p.brand)
    if (arr) arr.push(p)
    else groups.set(p.brand, [p])
  }
  if (groups.size <= 2) return list
  const queues = Array.from(groups.values())
  const out: T[] = []
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

// memo: 부모(Explore 히어로)의 타이핑 플레이스홀더가 초당 수십 번 setState 하는데,
// 그때마다 상품 60개 그리드까지 리렌더되면 입력·스크롤이 밀린다. gender 만 보는 순수 props.
function FinderSectionInner({ gender }: { gender: "여성" | "남성" }) {
  const router = useRouter()
  const [curCat, setCurCat] = useState("전체")
  // 카드 클릭 = PDP 모달 (외부 새탭 아님 — 구매는 PDP 안의 Buy가 담당)
  const [pdpTarget, setPdpTarget] = useState<PdpTarget | null>(null)
  const [curSub, setCurSub] = useState<string | null>(null)
  const [curSubAttr, setCurSubAttr] = useState<string | null>(null)
  // 스타일 필은 단일 선택 (사용자 확정) — 같은 필 재탭 시 해제
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [brandQuery, setBrandQuery] = useState("")
  const [debouncedBrand, setDebouncedBrand] = useState("")

  // gender prop drives NAV/STYLES and resets downstream selection (per props contract)
  useEffect(() => {
    setCurCat("전체")
    setCurSub(null)
    setCurSubAttr(null)
    setSelectedStyle(null) // 성별별 스타일 목록이 달라 이월되면 유령 선택이 됨
  }, [gender])

  // 브랜드 검색만 타이핑 중 재요청을 억제(300ms) — 카테고리/품목/정렬 클릭은 즉시 반영해
  // 인풋 지연 없이 반응한다.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBrand(brandQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [brandQuery])

  // 카테고리 원형 썸네일 프리페치 — 스크롤로 내려오거나 성별을 토글해도 즉시 뜨게
  // 마운트 시 1회, 성별 무관 전체 이미지를 미리 캐시에 올린다.
  useEffect(() => {
    Object.values(CAT_IMG).forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  const [products, setProducts] = useState<FinderApiProduct[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [page, setPage] = useState(0) // 0-based, 표기는 1-based
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // 셔플 페이지 안정화 seed — 세션당 1회 생성, 라우트가 setseed() 에 사용.
  // 같은 세션 내 페이지 이동 시 셔플 순서가 흔들리지 않는다.
  const [shuffleSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))

  const [sortOption, setSortOption] = useState<SortOption>("newest")
  // 사용자가 정렬 메뉴에서 명시적으로 고르기 전(기본 상태)에는 무필터 조합에서 shuffle 노출
  const [sortTouched, setSortTouched] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)

  // 현재 컨텍스트(성별·카테고리·품목·nav 속성)의 스타일 태그별 개수 — 0개 필 흐림 처리용
  const [tagCounts, setTagCounts] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    const nav = resolveNavQuery(curCat, curSub)
    const params = new URLSearchParams()
    params.set("gender", GENDER_TO_API[gender])
    if (nav.category) params.set("category", nav.category)
    if (nav.subcategory) params.set("subcategory", nav.subcategory)
    const controller = new AbortController()
    fetch(`/api/web-finder/tag-counts?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted && data?.counts) setTagCounts(data.counts)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [gender, curCat, curSub])

  // 선택된 품목별 속성 칩 → v2.6 attr 필터 (label → key/value 는 SUBATTR 축에서 해석)
  const subAttrAxis = (curSub && SUBATTR[curSub]) || null
  const attrSelected =
    subAttrAxis && curSubAttr ? subAttrAxis.options.find((o) => o.label === curSubAttr) ?? null : null

  // 필터 시그니처 — 바뀌면 1페이지로 리셋 후 로드, 페이지만 바뀌면 해당 페이지 교체 로드
  const filterKey = [
    gender, curCat, curSub, curSubAttr, sortOption, String(sortTouched), debouncedBrand, selectedStyle,
  ].join("|")
  const lastFilterKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey
      if (page !== 0) {
        setPage(0) // 필터 변경 → 1페이지 리셋 (이 effect 가 page=0 으로 다시 돌며 로드)
        return
      }
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    const nav = resolveNavQuery(curCat, curSub)
    // 스타일 필: 상품 레벨 gate_tags 가 정본, 태그 미존재 라벨만 브랜드 노드 폴백
    const gateTag = selectedStyle ? STYLE_GATE_TAGS[selectedStyle] : undefined
    const nodeCodes = selectedStyle && !gateTag ? STYLE_NODE_CODES[selectedStyle] : undefined
    // 무필터 + 정렬 미변경 기본 상태 = 크롤 최신순 대신 랜덤 샘플 노출 (사용자 확정).
    // 카테고리/브랜드/스타일/속성 필터를 걸거나 정렬을 명시적으로 고르면 해당 정렬 사용.
    const isDefaultView =
      !nav.category && !nav.subcategory && !debouncedBrand && !gateTag && !nodeCodes?.length && !attrSelected && !sortTouched
    const params = new URLSearchParams()
    params.set("gender", GENDER_TO_API[gender])
    params.set("sort", isDefaultView ? "shuffle" : sortOption)
    params.set("page", String(page))
    if (isDefaultView) params.set("seed", String(shuffleSeed))
    if (nav.category) params.set("category", nav.category)
    if (nav.subcategory) params.set("subcategory", nav.subcategory)
    if (debouncedBrand) params.set("brand", debouncedBrand)
    if (gateTag) params.set("tag", gateTag)
    if (nodeCodes?.length) params.set("nodes", nodeCodes.join(","))
    if (subAttrAxis && attrSelected) {
      params.set("attrKey", subAttrAxis.key)
      params.set("attrValue", attrSelected.value)
    }

    fetch(`/api/web-finder/products?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<FinderApiResponse>)
      .then((data) => {
        if (controller.signal.aborted) return
        setLoadError(false)
        setProducts(debouncedBrand ? data.products ?? [] : interleaveByBrand(data.products ?? []))
        setTotal(typeof data.total === "number" ? data.total : null)
        setTotalPages(typeof data.totalPages === "number" ? data.totalPages : null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        // 요청 실패 시 이전 그리드는 그대로 유지(빈 화면으로 갈아엎지 않음) —
        // 단, 이전 결과가 아예 없었다면(첫 로드 실패) "결과 없음"과 구분되게 loadError 로 표시
        setLoadError(true)
      })
      .finally(() => {
        if (abortRef.current === controller) setLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page])

  // 페이지 이동 — 파인더 섹션 시작으로 부드럽게 스크롤 (reduced motion 은 즉시 점프)
  const gotoPage = (p: number) => {
    if (totalPages == null || p < 0 || p >= totalPages || p === page) return
    setPage(p)
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    rootRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
  }

  const [collections, setCollections] = useState<Collection[]>([
    { name: "여름 릴스", items: new Set() },
    { name: "가을 화보", items: new Set() },
  ])
  // 컬렉션 필터: "off"=필터 없음(기본), "all"=전체 저장만, number=해당 컬렉션만.
  // 저장했다고 그리드가 자동 축소되면 어색 — 명시적 칩 클릭 시에만 필터 (사용자 확정)
  const [colFilter, setColFilter] = useState<"off" | "all" | number>("off")
  const [picker, setPicker] = useState<{ key: string; top: number; left: number } | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)

  const totalSaved = useMemo(() => {
    const s = new Set<string>()
    collections.forEach((c) => c.items.forEach((k) => s.add(k)))
    return s
  }, [collections])
  const inAny = (key: string) => collections.some((c) => c.items.has(key))

  // 저장이 하나라도 있으면 컬렉션 바(정보성)는 노출하되, 그리드 필터는 colFilter 로만.
  const colbarVisible = totalSaved.size > 0

  const cats = NAV[gender].cats
  const subBase = (curCat !== "전체" && NAV[gender].sub[curCat]) || []
  const subList = subBase.length ? ["전체", ...subBase] : []
  const activeSub = curSub || "전체"

  const onSelectCat = (name: string) => {
    setCurCat(name)
    setCurSub(null)
    setCurSubAttr(null)
  }
  const onSelectSub = (label: string) => {
    setCurSub(label === "전체" ? null : label)
    setCurSubAttr(null)
  }
  const onSelectSubAttr = (label: string) => {
    setCurSubAttr(label === "전체" ? null : label)
  }
  const togglePill = (name: string) => {
    setSelectedStyle((prev) => (prev === name ? null : name))
  }

  const openPicker = (key: string, btn: HTMLElement) => {
    setSortOpen(false) // 팝오버는 한 번에 하나만 (HIG modality)
    const r = btn.getBoundingClientRect()
    setPicker({
      key,
      top: Math.min(r.bottom + 8, window.innerHeight - 340),
      left: Math.max(8, Math.min(r.right - 222, window.innerWidth - 232)),
    })
  }
  const closePicker = () => setPicker(null)

  const onHeartClick = (e: ReactMouseEvent<HTMLButtonElement>, key: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (inAny(key)) {
      setCollections((prev) => prev.map((c) => {
        const items = new Set(c.items)
        items.delete(key)
        return { ...c, items }
      }))
    } else {
      openPicker(key, e.currentTarget)
    }
  }

  const toggleInCollection = (i: number) => {
    if (!picker) return
    setCollections((prev) => prev.map((c, ci) => {
      if (ci !== i) return c
      const items = new Set(c.items)
      if (items.has(picker.key)) items.delete(picker.key)
      else items.add(picker.key)
      return { ...c, items }
    }))
  }

  const createCollection = () => {
    if (!picker) return
    const name = window.prompt("새 컬렉션 이름")
    if (!name) return
    setCollections((prev) => [...prev, { name, items: new Set([picker.key]) }])
  }

  const deleteCollection = (i: number) => {
    if (!window.confirm(`'${collections[i].name}' 컬렉션을 삭제할까요?`)) return
    setCollections((prev) => prev.filter((_, ci) => ci !== i))
    setColFilter("off")
  }

  // 팝오버 바깥 클릭 시 닫기 (mockup: document click listener)
  useEffect(() => {
    if (!picker) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (pickerRef.current?.contains(target)) return
      if (target.closest('[data-role="save-btn"]')) return
      closePicker()
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [picker])

  // 정렬 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!sortOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (sortMenuRef.current?.contains(target)) return
      if (target.closest('[data-role="sort-btn"]')) return
      setSortOpen(false)
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [sortOpen])

  const visibleProducts = useMemo(() => {
    if (colFilter === "off") return products
    const filterSet = colFilter === "all" ? totalSaved : collections[colFilter]?.items ?? new Set<string>()
    return products.filter((p) => filterSet.has(p.id))
  }, [products, colFilter, collections, totalSaved])

  const titleParts = [gender as string]
  if (curCat !== "전체") titleParts.push(curCat)
  if (curSub) titleParts.push(curSub)
  if (curSubAttr) titleParts.push(curSubAttr)

  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortOption)?.label ?? "정렬"
  const showSkeleton = loading && products.length === 0

  return (
    <div className={styles.finderRoot} ref={rootRef}>
      <div className={styles.wrap}>
        {/* 애플 웹스토어 타이틀 문법: 검정 대형 타이틀 + 타이틀급 회색 브레드크럼 + 브랜드 검색 */}
        <div className={styles.head}>
          <div className={styles.headTitles}>
            <h1>카테고리로 찾기</h1>
            <div className={styles.crumb}>
              {titleParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className={styles.sep}>·</span>}
                  {part}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.brandSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="amp-unmask"
              type="text"
              placeholder="브랜드 검색"
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.catrow}>
          {cats.map((name) => {
            const all = name === "전체"
            const on = name === curCat
            return (
              <button
                key={name}
                type="button"
                className={[styles.catitem, all ? styles.all : "", on ? styles.on : ""].filter(Boolean).join(" ")}
                onClick={() => onSelectCat(name)}
              >
                {all ? (
                  <div className={styles.catthumb}>
                    <span>All</span>
                  </div>
                ) : (
                  <div className={styles.catthumb}>
                    {/* 내비 아이콘이라 lazy 금지 — 스크롤 도달 시 늦게 뜨는 문제 (사용자 피드백) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={CAT_IMG[name]}
                      alt=""
                      loading="eager"
                      fetchPriority="high"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0"
                      }}
                    />
                  </div>
                )}
                <div className={styles.catlabel}>{name}</div>
              </button>
            )
          })}
        </div>

        {subList.length > 0 && (
          <div className={styles.subrow}>
            {subList.map((label) => (
              <button
                key={label}
                type="button"
                className={`${styles.sublink} ${label === activeSub ? styles.on : ""}`}
                onClick={() => onSelectSub(label)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 품목별 속성 칩 — VLM v2.6 실필터 (SUBATTR 축 label → attrKey/attrValue 재쿼리) */}
        {subAttrAxis && (
          <div className={`${styles.subsubrow} ${styles.on}`}>
            {["전체", ...subAttrAxis.options.map((o) => o.label)].map((label) => {
              const active = curSubAttr ? label === curSubAttr : label === "전체"
              return (
                <button
                  key={label}
                  type="button"
                  className={`${styles.sschip} ${active ? styles.on : ""}`}
                  onClick={() => onSelectSubAttr(label)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        <div className={styles.toolbar}>
          {/* 스타일 필: 단일 선택 → gate_tags 재쿼리. 현재 카테고리 컨텍스트에서 0개인 필은
              흐리게 + 비활성 (tag-counts API) */}
          <div className={styles.pills}>
            {STYLES[gender].map((name) => {
              const tag = STYLE_GATE_TAGS[name]
              const empty = tag != null && tagCounts != null && !(tagCounts[tag] > 0)
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.pill} ${selectedStyle === name ? styles.on : ""} ${empty ? styles.pillDim : ""}`}
                  disabled={empty}
                  onClick={() => togglePill(name)}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <div className={styles.toolmeta}>
            {total != null && <span>전체 {total.toLocaleString("ko-KR")}개</span>}
          </div>
          <div className={styles.sortWrap}>
            <button
              type="button"
              data-role="sort-btn"
              className={styles.sort}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => {
                closePicker() // 팝오버는 한 번에 하나만 (HIG modality)
                setSortOpen((v) => !v)
              }}
            >
              {activeSortLabel}
              <svg className={styles.chev} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {sortOpen && (
              <div ref={sortMenuRef} className={styles.sortMenu} role="listbox">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={o.value === sortOption}
                    className={o.value === sortOption ? styles.on : ""}
                    onClick={() => {
                      setSortOption(o.value)
                      setSortTouched(true)
                      setSortOpen(false)
                    }}
                  >
                    {o.label}
                    <span className={styles.chk}>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {colbarVisible && (
          <div className={`${styles.colbar} ${styles.on}`}>
            <button
              type="button"
              className={`${styles.colchip} ${colFilter === "all" ? styles.on : ""}`}
              onClick={() => setColFilter((f) => (f === "all" ? "off" : "all"))}
            >
              전체 저장
            </button>
            {collections.map((c, i) => (
              <button
                key={c.name + i}
                type="button"
                className={`${styles.colchip} ${colFilter === i ? styles.on : ""}`}
                onClick={() => setColFilter((f) => (f === i ? "off" : i))}
              >
                {c.name} {c.items.size}
                <span
                  className={styles.del}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCollection(i)
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={`${styles.grid} ${loading && products.length > 0 ? styles.gridRefetching : ""}`}>
          {showSkeleton
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeletonCard} />)
            : visibleProducts.map((p) => {
                const saved = inAny(p.id)
                // 가격 노출 정책: 썸네일 = 할인%(레드) + 현재가(sale_price ?? price).
                // original_price > 현재가일 때만 % 표시, 정가 자체는 미노출.
                const current = p.salePrice ?? p.price
                const discountPct =
                  current != null && p.originalPrice != null && p.originalPrice > current
                    ? Math.round((1 - current / p.originalPrice) * 100)
                    : null
                return (
                  <div
                    key={p.id}
                    className={styles.card}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setPdpTarget({
                        id: Number(p.id),
                        fallback: { brand: p.brand, name: p.name, price: current, img: p.imageUrl ?? "" },
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setPdpTarget({
                          id: Number(p.id),
                          fallback: { brand: p.brand, name: p.name, price: current, img: p.imageUrl ?? "" },
                        })
                      }
                    }}
                  >
                    <div className={styles.thumb}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        src={p.imageUrl ?? ""}
                        alt={p.name}
                        onError={(e) => {
                          e.currentTarget.style.opacity = "0"
                        }}
                      />
                      <button
                        type="button"
                        data-role="save-btn"
                        className={`${styles.save} ${saved ? styles.on : ""}`}
                        aria-label="컬렉션에 저장"
                        onClick={(e) => onHeartClick(e, p.id)}
                      >
                        {HEART}
                      </button>
                    </div>
                    <div className={styles.meta}>
                      <div className={styles.mBrand}>{p.brand}</div>
                      <div className={styles.mName}>{p.name}</div>
                      <div className={styles.mPrice}>
                        {discountPct != null && <span className={styles.mDiscount}>{discountPct}%</span>}
                        {krw(current)}
                      </div>
                    </div>
                  </div>
                )
              })}
        </div>

        {/* 페이지네이션 — 애플 웹스토어 문법: 원형 화살표(hairline) + 현재 ±2/처음/끝 + 말줄임 */}
        {totalPages != null && totalPages > 1 && (
          <nav className={styles.pager} aria-label="페이지 이동">
            <button
              type="button"
              className={styles.pageArrow}
              aria-label="이전 페이지"
              disabled={page === 0}
              onClick={() => gotoPage(page - 1)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            {/* 애플 패들 문법: 숫자 나열 대신 현재/전체 카운터만 */}
            <span className={styles.pageCount} aria-live="polite">
              <b>{page + 1}</b>
              <span className={styles.pageCountSep}>/</span>
              {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageArrow}
              aria-label="다음 페이지"
              disabled={page >= totalPages - 1}
              onClick={() => gotoPage(page + 1)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </nav>
        )}

        {!loading && visibleProducts.length === 0 && (
          <div className={styles.empty}>
            {loadError && products.length === 0
              ? "상품을 불러오지 못했습니다, 잠시 후 다시 시도해주세요"
              : "조건에 맞는 상품이 없습니다"}
          </div>
        )}
      </div>

      <ProductPdp
        target={pdpTarget}
        onClose={() => setPdpTarget(null)}
        onRequery={(name, mode) => {
          // 파인더 컨텍스트의 재쿼리 = 챗 핸드오프 (쿼리 문구는 챗과 동일 규칙)
          setPdpTarget(null)
          const q =
            mode === "cheaper" ? `${name}보다 더 저렴한 걸로 찾아줘` : `${name}랑 비슷한 스타일 찾아줘`
          router.push(`/chat?q=${encodeURIComponent(q)}&g=${gender === "여성" ? "women" : "men"}`)
        }}
      />

      {picker && (
        <div
          ref={pickerRef}
          className={`${styles.picker} ${styles.open}`}
          style={{ top: picker.top, left: picker.left }}
        >
          <h4>컬렉션에 저장</h4>
          {collections.map((c, i) => {
            const on = c.items.has(picker.key)
            return (
              <button key={c.name + i} type="button" className={on ? styles.on : ""} onClick={() => toggleInCollection(i)}>
                {c.name}
                <span className={styles.chk}>✓</span>
              </button>
            )
          })}
          <button type="button" className={styles.newcol} onClick={createCollection}>
            + 새 컬렉션
          </button>
        </div>
      )}
    </div>
  )
}

const FinderSection = memo(FinderSectionInner)
export default FinderSection
