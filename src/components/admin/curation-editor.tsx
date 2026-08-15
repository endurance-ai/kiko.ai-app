"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import Image from "next/image"
import Link from "next/link"
import {useRouter} from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import {cn} from "@/lib/utils"
import type {CurationProduct, CurationSection, Gender} from "@/domains/admin-tools/curation/types"
import {
  appendProductIds,
  CURATION_WARNING_MIN,
  getEditorialActivationBlocker,
  MAX_CURATION_PRODUCTS,
  moveProductId,
  parseProductIds,
} from "@/domains/admin-tools/curation/editor-utils"

type SearchProduct = {
  id: string
  brand: string
  name: string
  price: number | null
  imageUrl: string | null
  inStock: boolean
}

const EMPTY_SECTION: CurationSection = {
  section_id: "",
  gender: "women",
  slot_type: "editorial",
  display_type: "default",
  title: "",
  subtitle: null,
  sort_order: 100,
  is_active: false,
  product_ids: [],
  live_count: 0,
  shown: 0,
}

const currency = new Intl.NumberFormat("ko-KR", {style: "currency", currency: "KRW", maximumFractionDigits: 0})
const CONTROL_CLASS = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"

export function CurationEditor({gender, sectionId}: {gender: Gender; sectionId?: string}) {
  const router = useRouter()
  const isNew = !sectionId
  const [draft, setDraft] = useState<CurationSection>({...EMPTY_SECTION, gender})
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [productMap, setProductMap] = useState<Map<number, CurationProduct>>(new Map())
  const [missingIds, setMissingIds] = useState<number[]>([])
  const [batchText, setBatchText] = useState("")
  const [query, setQuery] = useState("")
  const [searchPage, setSearchPage] = useState(0)
  const [searchProducts, setSearchProducts] = useState<SearchProduct[]>([])
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const dragIndex = useRef<number | null>(null)

  const verifyProducts = useCallback(async (ids: number[], targetGender: Gender) => {
    if (ids.length === 0) {
      setProductMap(new Map())
      setMissingIds([])
      return {products: [] as CurationProduct[], missing: [] as number[]}
    }
    const response = await fetch(
      `/api/admin/curation-sections?view=products&gender=${targetGender}&ids=${ids.join(",")}`
    )
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
    const products = data.products as CurationProduct[]
    const missing = data.missing as number[]
    setProductMap(new Map(products.map((product) => [product.product_id, product])))
    setMissingIds(missing)
    return {products, missing}
  }, [])

  useEffect(() => {
    if (isNew) {
      setDraft({...EMPTY_SECTION, gender})
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/curation-sections?gender=${gender}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
        const section = (data.sections as CurationSection[]).find((item) => item.section_id === sectionId)
        if (!section) throw new Error("구좌를 찾을 수 없습니다.")
        if (cancelled) return
        const ids = section.product_ids
        setDraft(section)
        setSelectedIds(ids)
        if (section.slot_type === "editorial") await verifyProducts(ids, gender)
        if (!cancelled) setDirty(false)
      } catch (err) {
        if (!cancelled) setMessage((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gender, isNew, sectionId, verifyProducts])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          const params = new URLSearchParams({
            mode: "curation",
            gender: draft.gender,
            search: query.trim(),
            page: String(searchPage),
          })
          const response = await fetch(`/api/admin/products?${params}`, {signal: controller.signal})
          const data = await response.json()
          if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
          setSearchProducts(data.products as SearchProduct[])
          setSearchHasMore(Boolean(data.hasMore))
        } catch (err) {
          if ((err as Error).name !== "AbortError") setMessage(`상품 검색 실패: ${(err as Error).message}`)
        } finally {
          if (!controller.signal.aborted) setSearching(false)
        }
      })()
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draft.gender, query, searchPage])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const updateDraft = (patch: Partial<CurationSection>) => {
    setDraft((current) => ({...current, ...patch}))
    setDirty(true)
  }

  const setIds = (ids: number[]) => {
    setSelectedIds(ids)
    setMissingIds((current) => current.filter((id) => ids.includes(id)))
    setDirty(true)
  }

  const addIds = async (incoming: number[]) => {
    const result = appendProductIds(selectedIds, incoming)
    setIds(result.ids)
    setBatchText("")
    const notices: string[] = []
    if (result.duplicateCount) notices.push(`중복 ${result.duplicateCount}개 제외`)
    if (result.overflowCount) {
      notices.push(`최대 ${MAX_CURATION_PRODUCTS}개를 넘어 ${result.overflowCount}개 제외`)
    }
    setMessage(notices.length ? notices.join(" · ") : `${result.ids.length}개 상품을 선택했습니다.`)
    try {
      await verifyProducts(result.ids, draft.gender)
    } catch (err) {
      setMessage(`상품 확인 실패: ${(err as Error).message}`)
    }
  }

  const removeId = (id: number) => {
    const next = selectedIds.filter((item) => item !== id)
    setIds(next)
    void verifyProducts(next, draft.gender).catch((err) => setMessage((err as Error).message))
  }

  const reorder = (from: number, to: number) => setIds(moveProductId(selectedIds, from, to))

  const save = async () => {
    const normalizedId = draft.section_id.trim()
    if (!/^[a-z0-9][a-z0-9-]*$/.test(normalizedId)) {
      setMessage("구좌 ID는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.")
      return
    }
    if (!draft.title.trim()) {
      setMessage("제목을 입력해 주세요.")
      return
    }
    if (draft.slot_type === "editorial" && selectedIds.length > MAX_CURATION_PRODUCTS) {
      setMessage(`상품은 최대 ${MAX_CURATION_PRODUCTS}개까지 등록할 수 있습니다.`)
      return
    }

    setBusy("save")
    setMessage(null)
    try {
      if (draft.slot_type === "editorial" && draft.is_active) {
        const checked = await verifyProducts(selectedIds, draft.gender)
        const blocker = getEditorialActivationBlocker(selectedIds, checked.products, checked.missing)
        if (blocker) throw new Error(blocker)
      }
      const response = await fetch("/api/admin/curation-sections", {
        method: "PUT",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          section_id: normalizedId,
          gender: draft.gender,
          slot_type: draft.slot_type,
          display_type: draft.display_type,
          title: draft.title.trim(),
          subtitle: draft.subtitle?.trim() || null,
          sort_order: draft.sort_order,
          is_active: draft.is_active,
          product_ids: draft.slot_type === "editorial" ? selectedIds : draft.product_ids,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setDirty(false)
      router.push(`/admin/curation?gender=${draft.gender}`)
      router.refresh()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!sectionId || !window.confirm(`${sectionId} 구좌를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return
    setBusy("delete")
    try {
      const response = await fetch(
        `/api/admin/curation-sections?section_id=${encodeURIComponent(sectionId)}&gender=${gender}`,
        {method: "DELETE"}
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setDirty(false)
      router.push(`/admin/curation?gender=${gender}`)
      router.refresh()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const invalidCount = useMemo(
    () => selectedIds.filter((id) => !productMap.get(id)?.eligible).length,
    [productMap, selectedIds]
  )
  const isAuto = draft.slot_type === "auto"

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div>
          <Link href={`/admin/curation?gender=${draft.gender}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 구좌 목록
          </Link>
          <h1 className="text-xl font-semibold">{isNew ? "새 큐레이션 구좌" : `${sectionId} 편집`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">상품 이미지를 확인하면서 선택하고 노출 순서를 정할 수 있습니다. 선택한 상품은 앱에 전부 노출됩니다.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <button onClick={() => void remove()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50">
              <Trash2 className="size-4" /> 삭제
            </button>
          )}
          <button onClick={() => void save()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} 저장
          </button>
        </div>
      </header>

      {message && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>{message}</span>
          <button className="ml-auto" onClick={() => setMessage(null)} aria-label="메시지 닫기"><X className="size-4" /></button>
        </div>
      )}

      <section className="rounded-lg border bg-background p-4">
        <h2 className="mb-4 font-medium">구좌 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="구좌 ID">
            <input value={draft.section_id} disabled={!isNew} onChange={(event) => updateDraft({section_id: event.target.value.toLowerCase()})} placeholder="editorial-summer" className={cn(CONTROL_CLASS, "font-mono disabled:bg-muted")} />
          </Field>
          <Field label="성별">
            <select value={draft.gender} disabled={!isNew} onChange={(event) => { updateDraft({gender: event.target.value as Gender}); setSearchPage(0); void verifyProducts(selectedIds, event.target.value as Gender) }} className={cn(CONTROL_CLASS, "disabled:bg-muted")}>
              <option value="women">여성</option><option value="men">남성</option>
            </select>
          </Field>
          <Field label="구좌 종류">
            <select value={draft.slot_type} disabled={!isNew} onChange={(event) => updateDraft({slot_type: event.target.value as CurationSection["slot_type"]})} className={cn(CONTROL_CLASS, "disabled:bg-muted")}>
              <option value="editorial">editorial · 직접 선정</option><option value="auto">auto · 자동 선정</option>
            </select>
          </Field>
          <Field label="디자인">
            <select value={draft.display_type} onChange={(event) => updateDraft({display_type: event.target.value as CurationSection["display_type"]})} className={CONTROL_CLASS}>
              <option value="default">default · 기본</option><option value="trending">trending · 트렌딩</option>
            </select>
          </Field>
          <Field label="제목"><input value={draft.title} onChange={(event) => updateDraft({title: event.target.value})} className={CONTROL_CLASS} /></Field>
          <Field label="서브타이틀"><input value={draft.subtitle ?? ""} onChange={(event) => updateDraft({subtitle: event.target.value})} className={CONTROL_CLASS} /></Field>
          <Field label="노출 순서"><input type="number" min={0} max={9999} value={draft.sort_order} onChange={(event) => updateDraft({sort_order: Number(event.target.value)})} className={CONTROL_CLASS} /></Field>
          <Field label="상태">
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft({is_active: event.target.checked})} /> 모바일에 노출</label>
          </Field>
        </div>
      </section>

      {isAuto ? (
        <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <h2 className="font-medium">자동 선정 구좌</h2>
          <p className="mt-1 text-sm text-muted-foreground">상품은 매일 서버에서 자동 계산되므로 여기서는 구좌 정보만 수정할 수 있습니다. 현재 노출 가능 {draft.live_count}개, 실제 노출 {draft.shown}개입니다.</p>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(500px,1fr)]">
          <section className="flex min-w-0 flex-col gap-4 rounded-lg border bg-background p-4">
            <div>
              <h2 className="font-medium">상품 찾기</h2>
              <p className="mt-1 text-xs text-muted-foreground">브랜드·상품명 또는 정확한 상품 ID로 검색합니다. 노출 가능한 상품만 표시됩니다.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input value={query} onChange={(event) => {setQuery(event.target.value); setSearchPage(0)}} placeholder="브랜드, 상품명, 상품 ID 검색" className={cn(CONTROL_CLASS, "pl-9")} />
              {searching && <Loader2 className="absolute right-3 top-3 size-4 animate-spin" />}
            </div>
            <div
              aria-busy={searching}
              className={cn(
                "grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4",
                searching && "opacity-60"
              )}
            >
              {searchProducts.map((product, index) => {
                const id = Number(product.id)
                const selected = selectedIds.includes(id)
                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-lg border"
                  >
                    <div className="relative aspect-[3/4] bg-muted">
                      <ProductImage src={product.imageUrl} alt={product.name} eager={index < 8} />
                      <button disabled={selected || selectedIds.length >= MAX_CURATION_PRODUCTS} onClick={() => void addIds([id])} className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-background shadow disabled:opacity-50" aria-label="상품 추가"><Plus className="size-4" /></button>
                    </div>
                    <div className="space-y-0.5 p-2 text-xs"><div className="truncate font-medium">{product.brand}</div><div className="line-clamp-2 min-h-8 text-muted-foreground">{product.name}</div><div className="flex justify-between"><span>{product.price == null ? "가격 없음" : currency.format(product.price)}</span><span className="font-mono text-muted-foreground">{product.id}</span></div></div>
                  </article>
                )
              })}
            </div>
            {!searching && searchProducts.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</div>}
            <div className="flex items-center justify-center gap-3 text-sm"><button disabled={searching || searchPage === 0} onClick={() => setSearchPage((page) => page - 1)} className="rounded border p-1 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{searchPage + 1}페이지</span><button disabled={searching || !searchHasMore} onClick={() => setSearchPage((page) => page + 1)} className="rounded border p-1 disabled:opacity-30"><ChevronRight className="size-4" /></button></div>
          </section>

          <section className="flex min-w-0 flex-col gap-4 rounded-lg border bg-background p-4">
            <div className="flex items-start gap-2"><div><h2 className="font-medium">선택 상품 <span className="tabular-nums">{selectedIds.length}/{MAX_CURATION_PRODUCTS}</span></h2><p className="mt-1 text-xs text-muted-foreground">카드를 드래그하거나 화살표를 눌러 모바일 노출 순서를 바꿉니다.</p></div>{selectedIds.length > 0 && selectedIds.length < CURATION_WARNING_MIN && <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700">12개 미만</span>}</div>
            <div className="flex gap-2"><textarea value={batchText} onChange={(event) => setBatchText(event.target.value)} rows={2} placeholder="상품 ID 여러 개 붙여넣기 (쉼표, 공백, 줄바꿈 구분)" className={cn(CONTROL_CLASS, "min-h-16 resize-none font-mono text-xs")} /><button onClick={() => void addIds(parseProductIds(batchText))} disabled={!batchText.trim()} className="shrink-0 rounded-md border px-3 text-sm disabled:opacity-50">추가</button></div>
            {(missingIds.length > 0 || invalidCount > 0) && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">존재하지 않거나 노출할 수 없는 상품 {Math.max(missingIds.length, invalidCount)}개가 포함되어 있습니다. 활성 저장 전에 제거해 주세요.</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
              {selectedIds.map((id, index) => {
                const product = productMap.get(id)
                const invalid = !product?.eligible
                return (
                  <article key={id} draggable onDragStart={() => {dragIndex.current = index}} onDragOver={(event) => event.preventDefault()} onDrop={() => {if (dragIndex.current != null) reorder(dragIndex.current, index); dragIndex.current = null}} className={cn("group overflow-hidden rounded-lg border bg-background", invalid && "border-destructive ring-1 ring-destructive/30")}>
                    <div className="relative aspect-[3/4] bg-muted">
                      <ProductImage src={product?.image_url ?? null} alt={product?.name ?? `상품 ${id}`} missingLabel="상품 정보를 찾을 수 없음" eager={index < 4} />
                      <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-semibold shadow">{index + 1}</span>
                      <GripVertical className="absolute right-2 top-2 size-5 cursor-grab rounded bg-background/90 p-0.5" />
                      <button onClick={() => removeId(id)} className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-background shadow" aria-label="상품 제거"><X className="size-4" /></button>
                    </div>
                    <div className="p-2 text-xs"><div className="truncate font-medium">{product?.brand || `상품 ${id}`}</div><div className="line-clamp-2 min-h-8 text-muted-foreground">{product?.name || "존재하지 않는 ID"}</div><div className="mt-1 flex items-center justify-between"><span className="font-mono text-muted-foreground">{id}</span><span className="flex gap-1"><button disabled={index === 0} onClick={() => reorder(index, index - 1)} className="rounded border p-0.5 disabled:opacity-30"><ChevronLeft className="size-3" /></button><button disabled={index === selectedIds.length - 1} onClick={() => reorder(index, index + 1)} className="rounded border p-0.5 disabled:opacity-30"><ChevronRight className="size-3" /></button></span></div></div>
                  </article>
                )
              })}
            </div>
            {selectedIds.length === 0 && <div className="rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground">왼쪽 검색 결과나 ID 붙여넣기로 상품을 추가하세요.</div>}
          </section>
        </div>
      )}
    </div>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <div><label className="mb-1.5 block text-xs text-muted-foreground">{label}</label>{children}</div>
}

function ProductImage({
  src,
  alt,
  missingLabel = "이미지 없음",
  eager = false,
}: {
  src: string | null
  alt: string
  missingLabel?: string
  eager?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = Boolean(src) && failedSrc === src

  if (!src || failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">
        {failed ? "이미지 로드 실패" : missingLabel}
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(min-width: 1536px) 160px, (min-width: 1280px) 180px, (min-width: 640px) 33vw, 50vw"
      className="object-cover"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
    />
  )
}
