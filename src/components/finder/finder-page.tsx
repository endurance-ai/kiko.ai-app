"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Image from "next/image"
import {ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, X} from "lucide-react"
import {Button} from "@/components/ui/button"
import type {FinderFilterOptionsResponse} from "@/app/api/finder/products/filter-options/route"
import {formatProductPrice} from "@/lib/format-product-price"

// 공개 크리에이터용 상품 탐색 페이지 — 어드민 "상품 DB"(src/components/admin/products-page.tsx)
// 를 읽기 전용으로 축소 복제한 것. 원본 대비:
//   - 제거: 임베딩/VLM/플랫폼/리뷰/재고 필터 UI, 카드의 PID/BID/EMB 표시, 내부 상세 링크
//   - 고정: 판매중(in_stock=true) 상품만 (서버에서 항상 필터링, UI 토글 없음)
//   - 추가: 스타일(트렌드) 더미 필터(맨 앞), 카드 클릭 시 외부 자사몰(product_url)로 새 탭 이동

type Product = {
  id: string
  brand: string
  name: string
  price: number | null
  sourceCurrency: string | null
  sourcePrice: number | null
  imageUrl: string | null
  category: string | null
  productUrl: string | null
  styleNode: {code: string; name_en: string} | null
}

const SELECT_CLASS =
  "h-8 text-xs border border-border rounded-md bg-background px-2 text-foreground focus:outline-none focus:border-foreground/40 min-w-[110px]"

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function OptionList({
  options,
  includeSelected,
  labelKey,
}: {
  options: {value: string; count?: number; label?: string}[]
  includeSelected?: string
  labelKey?: "label"
}) {
  const seen = new Set<string>()
  const list: {value: string; count?: number; label?: string}[] = []
  for (const o of options) {
    if (seen.has(o.value)) continue
    seen.add(o.value)
    list.push(o)
  }
  if (includeSelected && !seen.has(includeSelected)) {
    list.unshift({value: includeSelected})
  }
  return (
    <>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {labelKey === "label" ? o.label ?? o.value : o.value}
          {o.count != null ? ` · ${fmtCount(o.count)}` : ""}
        </option>
      ))}
    </>
  )
}

function ProductCard({p}: {p: Product}) {
  const [imgError, setImgError] = useState(false)
  const tags = [p.category, p.styleNode?.code].filter(Boolean)

  const cardBody = (
    <article className="border border-border rounded-md overflow-hidden hover:border-foreground/40 transition-colors bg-card">
      {/* Image */}
      <div className="aspect-[3/4] relative bg-muted">
        {p.imageUrl && !imgError ? (
          <Image
            src={p.imageUrl}
            alt={p.name}
            fill
            sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            unoptimized
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">No Image</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-2 space-y-0.5">
        <p className="text-[10px] text-muted-foreground truncate">{p.brand}</p>
        <p className="text-xs font-medium truncate">{p.name}</p>
        <p className="text-xs tabular-nums">
          {formatProductPrice({
            sourcePrice: p.sourcePrice,
            sourceCurrency: p.sourceCurrency,
            krwPrice: p.price,
          })}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((t) => (
              <span
                key={t as string}
                className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )

  // product_url 없는 상품은 클릭 비활성 — 링크 없이 카드만 표시 (깨지지 않게).
  if (!p.productUrl) {
    return (
      <div className="block cursor-default opacity-90" aria-disabled="true">
        {cardBody}
      </div>
    )
  }

  return (
    <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="group block">
      {cardBody}
    </a>
  )
}

// TODO: 트렌드 태깅 파이프라인 연동 전까지 더미 상수. 백엔드 준비되면
// 옵션을 API(filter-options)에서 받아오도록 교체.
const STYLE_TREND_OPTIONS = ["Y2K", "그런지", "미니멀", "시티보이", "올드머니", "발레코어", "클린걸", "고프코어"]

interface FilterState {
  search: string
  category: string
  subcategory: string
  gender: string
  styleNode: string
  styleTrend: string
  price: string
  sort: string
}

const DEFAULTS: FilterState = {
  search: "",
  category: "",
  subcategory: "",
  gender: "",
  styleNode: "",
  styleTrend: "",
  price: "",
  sort: "newest",
}

const CHIP_LABELS: Record<string, string> = {
  search: "검색",
  category: "카테고리",
  subcategory: "서브카테고리",
  gender: "성별",
  styleNode: "노드",
  styleTrend: "스타일",
  price: "가격",
  sort: "정렬",
}

const STATUS_LABELS: Record<string, string> = {
  price_desc: "가격↓",
  price_asc: "가격↑",
  brand_asc: "브랜드 A-Z",
}

const PRICE_LABELS: Record<string, string> = {
  "0-50000": "~5만",
  "50000-100000": "5~10만",
  "100000-300000": "10~30만",
  "300000-": "30만~",
}

export default function FinderPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "0") || 0)
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<FilterState>(() => ({
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    subcategory: searchParams.get("subcategory") || "",
    gender: searchParams.get("gender") || "",
    styleNode: searchParams.get("styleNode") || "",
    styleTrend: searchParams.get("styleTrend") || "",
    price: searchParams.get("price") || "",
    sort: searchParams.get("sort") || "newest",
  }))

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  const [options, setOptions] = useState<FinderFilterOptionsResponse | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const update = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({...prev, ...patch}))
    setPage(0)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const res = await fetch("/api/finder/products/filter-options")
        if (!res.ok) {
          const err = await res.json().catch(() => ({error: "failed"}))
          if (!cancelled) setOptionsError(err.error || "필터 옵션 로드 실패")
          return
        }
        const data = (await res.json()) as FinderFilterOptionsResponse
        if (!cancelled) setOptions(data)
      } catch (e) {
        if (!cancelled) setOptionsError((e as Error).message)
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

  // 검색은 버튼 클릭/Enter 시에만 실행 (자동 디바운스 제거) — 확장검색 부하 절감.
  const submitSearch = useCallback(() => {
    setDebouncedSearch(filters.search)
    setPage(0)
  }, [filters.search])

  useEffect(() => {
    const params = new URLSearchParams()
    const state: Record<string, string> = {
      ...filters,
      search: debouncedSearch,
      page: String(page),
    }
    for (const [k, v] of Object.entries(state)) {
      if (v && v !== "newest" && v !== "0") params.set(k, v)
    }
    const qs = params.toString()
    router.replace(`/finder${qs ? `?${qs}` : ""}`, {scroll: false})
  }, [router, filters, debouncedSearch, page])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        search: debouncedSearch,
        category: filters.category,
        subcategory: filters.subcategory,
        gender: filters.gender,
        styleNode: filters.styleNode,
        sort: filters.sort,
        // TODO: 트렌드 태깅 파이프라인 연동 후 API 파라미터로 전달 (filters.styleTrend)
      })
      const [priceMin, priceMax] = filters.price.split("-")
      if (priceMin) params.set("priceMin", priceMin)
      if (priceMax) params.set("priceMax", priceMax)
      const res = await fetch(`/api/finder/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 0)
      }
    } finally {
      setLoading(false)
    }
    // 검색어(filters.search)는 debouncedSearch 로만 트리거 — 타이핑마다 재fetch 방지.
    // styleTrend 는 아직 API 미연동이라 의존성에서도 제외 (변경돼도 재fetch 불필요).
  }, [
    page,
    debouncedSearch,
    filters.category,
    filters.subcategory,
    filters.gender,
    filters.styleNode,
    filters.price,
    filters.sort,
  ])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const resetFilters = () => {
    setFilters(DEFAULTS)
    setDebouncedSearch("")
    setPage(0)
  }

  const toggleStyleTrend = (val: string) => {
    const selected = filters.styleTrend.split(",").filter(Boolean)
    const active = selected.includes(val)
    update({
      styleTrend: (active ? selected.filter((v) => v !== val) : [...selected, val]).join(","),
    })
  }

  const activeChips = useMemo(() => {
    const chips: {key: keyof FilterState; label: string; onClear: () => void}[] = []
    const pushIfValue = (
      key: keyof FilterState,
      clearValue: string = "",
      toLabel?: (v: string) => string
    ) => {
      const val = filters[key]
      if (!val || val === clearValue) return
      const label = `${CHIP_LABELS[key]}: ${toLabel ? toLabel(val) : val}`
      chips.push({key, label, onClear: () => update({[key]: clearValue} as Partial<FilterState>)})
    }
    if (debouncedSearch) {
      chips.push({
        key: "search",
        label: `${CHIP_LABELS.search}: ${debouncedSearch}`,
        onClear: () => update({search: ""}),
      })
    }
    pushIfValue("category")
    pushIfValue("subcategory")
    if (filters.gender) {
      const gLabel = filters.gender
        .split(",")
        .filter(Boolean)
        .map((g) => (g === "men" ? "남" : g === "women" ? "여" : "공용"))
        .join(",")
      chips.push({key: "gender", label: `${CHIP_LABELS.gender}: ${gLabel}`, onClear: () => update({gender: ""})})
    }
    if (filters.styleTrend) {
      chips.push({
        key: "styleTrend",
        label: `${CHIP_LABELS.styleTrend}: ${filters.styleTrend.split(",").filter(Boolean).join(", ")}`,
        onClear: () => update({styleTrend: ""}),
      })
    }
    pushIfValue("styleNode")
    pushIfValue("price", "", (v) => PRICE_LABELS[v] ?? v)
    if (filters.sort !== "newest") {
      chips.push({
        key: "sort",
        label: `${CHIP_LABELS.sort}: ${STATUS_LABELS[filters.sort] ?? filters.sort}`,
        onClear: () => update({sort: "newest"}),
      })
    }
    return chips
  }, [filters, debouncedSearch, update])

  const selectedStyleTrends = filters.styleTrend.split(",").filter(Boolean)

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">상품 탐색</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString()}개 상품
        </span>
      </div>

      {/* Filter bar */}
      <div className="space-y-2.5 border border-border bg-card rounded-md p-3">
        {optionsError && (
          <div className="text-[11px] text-amber-400/80">
            필터 옵션 로드 실패: {optionsError}
          </div>
        )}

        {/* Row 0: 스타일(트렌드) — 맨 앞. 더미 옵션, 아직 API 미연동 */}
        <FilterRow label="스타일">
          <div className="flex flex-wrap items-center gap-1">
            {STYLE_TREND_OPTIONS.map((val) => {
              const active = selectedStyleTrends.includes(val)
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleStyleTrend(val)}
                  className={`h-8 px-2.5 rounded-md border text-xs transition-colors ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {val}
                </button>
              )
            })}
          </div>
        </FilterRow>

        {/* Row 1: Search + Sort + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              placeholder="브랜드/이름 검색 (한/영, Enter)"
              value={filters.search}
              onChange={(e) => setFilters((p) => ({...p, search: e.target.value}))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch()
              }}
              className="h-8 w-full text-xs border border-border rounded-md bg-background pl-8 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            />
          </div>
          <button
            type="button"
            onClick={submitSearch}
            className="h-8 px-3 rounded-md border border-foreground bg-foreground text-background text-xs transition-colors hover:opacity-90"
          >
            검색
          </button>
          <select
            value={filters.sort}
            onChange={(e) => update({sort: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="newest">최신순</option>
            <option value="price_desc">가격↓</option>
            <option value="price_asc">가격↑</option>
            <option value="brand_asc">브랜드 A-Z</option>
          </select>
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <button
            onClick={resetFilters}
            disabled={activeChips.length === 0}
            className="h-8 text-xs px-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="size-3" />
            초기화
          </button>
        </div>

        {/* Row 2: 상품 속성 */}
        <FilterRow label="상품">
          <select
            value={filters.category}
            onChange={(e) => update({category: e.target.value, subcategory: ""})}
            className={SELECT_CLASS}
          >
            <option value="">카테고리</option>
            {options && (
              <OptionList options={options.categories} includeSelected={filters.category} />
            )}
          </select>
          <select
            value={filters.subcategory}
            onChange={(e) => update({subcategory: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">서브카테고리</option>
            {options && (
              <OptionList
                options={
                  filters.category
                    ? options.subcategories.filter((s) => s.category === filters.category)
                    : options.subcategories
                }
                includeSelected={filters.subcategory}
              />
            )}
          </select>
          <div className="flex items-center gap-1">
            {([["men", "남"], ["women", "여"], ["unisex", "공용"]] as const).map(([val, lbl]) => {
              const selected = filters.gender.split(",").filter(Boolean)
              const active = selected.includes(val)
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    update({
                      gender: (active
                        ? selected.filter((g) => g !== val)
                        : [...selected, val]
                      ).join(","),
                    })
                  }
                  className={`h-8 px-2.5 rounded-md border text-xs transition-colors ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {lbl}
                </button>
              )
            })}
          </div>
          <select
            value={filters.price}
            onChange={(e) => update({price: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">가격대</option>
            <option value="0-50000">~5만</option>
            <option value="50000-100000">5~10만</option>
            <option value="100000-300000">10~30만</option>
            <option value="300000-">30만~</option>
          </select>
          <select
            value={filters.styleNode}
            onChange={(e) => update({styleNode: e.target.value})}
            className={SELECT_CLASS}
            title="브랜드의 primary style node 로 필터"
          >
            <option value="">스타일 노드</option>
            {options && (
              <OptionList
                options={options.styleNodes}
                includeSelected={filters.styleNode}
                labelKey="label"
              />
            )}
          </select>
        </FilterRow>

        {/* Active chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onClear}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-foreground/15 text-foreground hover:bg-foreground/10 transition-colors"
              >
                {chip.label}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading && products.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex justify-center py-20">
          <p className="text-sm text-muted-foreground">상품이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages} 페이지 · 총 {total.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function FilterRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground w-[60px] shrink-0">
        {label}
      </span>
      {children}
    </div>
  )
}
