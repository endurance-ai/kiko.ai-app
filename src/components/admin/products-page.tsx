"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {Check, ChevronLeft, ChevronRight, Copy, Loader2, RotateCcw, Search, X} from "lucide-react"
import {Button} from "@/components/ui/button"
import type {FilterOptionsResponse} from "@/app/api/admin/products/filter-options/route"
import {formatProductPrice} from "@/lib/format-product-price"

type Product = {
  id: string
  brand: string
  brandNodeId: number | null
  name: string
  price: number | null
  sourceCurrency: string | null
  sourcePrice: number | null
  imageUrl: string | null
  platform: string
  category: string | null
  inStock: boolean
  hasFeatures: boolean
  reviewCount: number
  hasEmbedding: boolean
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
  const [copiedPid, setCopiedPid] = useState(false)
  const [copiedBid, setCopiedBid] = useState(false)
  const tags = [p.category, p.styleNode?.code].filter(Boolean)

  const handleCopyPid = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(String(p.id))
    setCopiedPid(true)
    setTimeout(() => setCopiedPid(false), 1000)
  }

  const handleCopyBid = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(String(p.brandNodeId))
    setCopiedBid(true)
    setTimeout(() => setCopiedBid(false), 1000)
  }

  return (
    <Link href={`/admin/products/${p.id}`} className="group block">
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
          {/* Embedding badge */}
          <div className="absolute top-1.5 right-1.5">
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                p.hasEmbedding
                  ? "bg-turquoise/20 text-turquoise"
                  : "bg-orange-400/15 text-orange-400"
              }`}
            >
              {p.hasEmbedding ? "EMB" : "—"}
            </span>
          </div>
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
          {/* ID row with copy buttons */}
          <div className="flex items-center gap-2 pt-1 text-[10px] tabular-nums text-muted-foreground">
            <div className="flex items-center gap-0.5">
              <span>PID {p.id}</span>
              <button
                type="button"
                onClick={handleCopyPid}
                className="inline-flex items-center justify-center p-0.5 hover:text-foreground transition-colors"
              >
                {copiedPid ? <Check size={10} /> : <Copy size={10} />}
              </button>
            </div>
            {p.brandNodeId != null && (
              <div className="flex items-center gap-0.5">
                <span>BID {p.brandNodeId}</span>
                <button
                  type="button"
                  onClick={handleCopyBid}
                  className="inline-flex items-center justify-center p-0.5 hover:text-foreground transition-colors"
                >
                  {copiedBid ? <Check size={10} /> : <Copy size={10} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}

interface FilterState {
  search: string
  category: string
  platform: string
  gender: string
  styleNode: string
  embeddingStatus: string
  stockStatus: string
  featureStatus: string
  reviewStatus: string
  sort: string
}

const DEFAULTS: FilterState = {
  search: "",
  category: "",
  platform: "",
  gender: "",
  styleNode: "",
  embeddingStatus: "all",
  stockStatus: "all",
  featureStatus: "all",
  reviewStatus: "all",
  sort: "newest",
}

const CHIP_LABELS: Record<string, string> = {
  search: "검색",
  category: "카테고리",
  platform: "플랫폼",
  gender: "성별",
  styleNode: "노드",
  embeddingStatus: "임베딩",
  stockStatus: "재고",
  featureStatus: "VLM",
  reviewStatus: "리뷰",
  sort: "정렬",
}

const STATUS_LABELS: Record<string, string> = {
  embedded: "있음",
  no_embedding: "없음",
  in_stock: "판매중",
  out_of_stock: "품절",
  with_features: "있음",
  no_features: "없음",
  with_reviews: "있음",
  no_reviews: "없음",
  price_desc: "가격↓",
  price_asc: "가격↑",
  brand_asc: "브랜드 A-Z",
}

export default function ProductsPageInner() {
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
    platform: searchParams.get("platform") || "",
    gender: searchParams.get("gender") || "",
    styleNode: searchParams.get("styleNode") || "",
    embeddingStatus: searchParams.get("embeddingStatus") || "all",
    stockStatus: searchParams.get("stockStatus") || "all",
    featureStatus: searchParams.get("featureStatus") || "all",
    reviewStatus: searchParams.get("reviewStatus") || "all",
    sort: searchParams.get("sort") || "newest",
  }))

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  const [options, setOptions] = useState<FilterOptionsResponse | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const update = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({...prev, ...patch}))
    setPage(0)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const res = await fetch("/api/admin/products/filter-options")
        if (!res.ok) {
          const err = await res.json().catch(() => ({error: "failed"}))
          if (!cancelled) setOptionsError(err.error || "필터 옵션 로드 실패")
          return
        }
        const data = (await res.json()) as FilterOptionsResponse
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchMountRef = useRef(false)
  useEffect(() => {
    // 초기 마운트(뒤로가기 복원 포함)엔 page 리셋 안 함 — URL 의 page 유지.
    if (!searchMountRef.current) {
      searchMountRef.current = true
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters.search])

  useEffect(() => {
    const params = new URLSearchParams()
    const state: Record<string, string> = {
      ...filters,
      search: debouncedSearch,
      page: String(page),
    }
    for (const [k, v] of Object.entries(state)) {
      if (v && v !== "all" && v !== "newest" && v !== "0") params.set(k, v)
    }
    const qs = params.toString()
    router.replace(`/admin/products${qs ? `?${qs}` : ""}`, {scroll: false})
  }, [router, filters, debouncedSearch, page])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        search: debouncedSearch,
        category: filters.category,
        platform: filters.platform,
        gender: filters.gender,
        styleNode: filters.styleNode,
        embeddingStatus: filters.embeddingStatus,
        stockStatus: filters.stockStatus,
        featureStatus: filters.featureStatus,
        reviewStatus: filters.reviewStatus,
        sort: filters.sort,
      })
      const res = await fetch(`/api/admin/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, filters])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const resetFilters = () => {
    setFilters(DEFAULTS)
    setDebouncedSearch("")
    setPage(0)
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
    pushIfValue("platform")
    if (filters.gender) {
      const gLabel = filters.gender
        .split(",")
        .filter(Boolean)
        .map((g) => (g === "men" ? "남" : g === "women" ? "여" : "공용"))
        .join(",")
      chips.push({key: "gender", label: `${CHIP_LABELS.gender}: ${gLabel}`, onClear: () => update({gender: ""})})
    }
    pushIfValue("styleNode")
    pushIfValue("embeddingStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("stockStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("featureStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("reviewStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    if (filters.sort !== "newest") {
      chips.push({
        key: "sort",
        label: `${CHIP_LABELS.sort}: ${STATUS_LABELS[filters.sort] ?? filters.sort}`,
        onClear: () => update({sort: "newest"}),
      })
    }
    return chips
  }, [filters, debouncedSearch, update])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">상품 DB</h1>
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

        {/* Row 1: Search + Sort + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              placeholder="브랜드/이름/플랫폼 검색..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({...p, search: e.target.value}))}
              className="h-8 w-full text-xs border border-border rounded-md bg-background pl-8 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            />
          </div>
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
            onChange={(e) => update({category: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">카테고리</option>
            {options && (
              <OptionList options={options.categories} includeSelected={filters.category} />
            )}
          </select>
          <select
            value={filters.platform}
            onChange={(e) => update({platform: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">플랫폼</option>
            {options && (
              <OptionList options={options.platforms} includeSelected={filters.platform} />
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

        {/* Row 3: 상태 */}
        <FilterRow label="상태">
          <select
            value={filters.embeddingStatus}
            onChange={(e) => update({embeddingStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">임베딩 여부</option>
            <option value="embedded">있음</option>
            <option value="no_embedding">없음</option>
          </select>
          <select
            value={filters.stockStatus}
            onChange={(e) => update({stockStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">재고</option>
            <option value="in_stock">판매중</option>
            <option value="out_of_stock">품절</option>
          </select>
          <select
            value={filters.featureStatus}
            onChange={(e) => update({featureStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">VLM 분석</option>
            <option value="with_features">있음</option>
            <option value="no_features">없음</option>
          </select>
          <select
            value={filters.reviewStatus}
            onChange={(e) => update({reviewStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">리뷰</option>
            <option value="with_reviews">있음</option>
            <option value="no_reviews">없음</option>
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
