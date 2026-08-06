"use client"

import {useEffect, useState} from "react"
import Link from "next/link"
import {ExternalLink, Loader2, Pencil, Plus, X} from "lucide-react"
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Textarea} from "@/components/ui/textarea"
import {cn} from "@/lib/utils"
import {fmtUsd} from "@/lib/currency-to-usd"

type NodeRef = {id: number; code: string; name_en: string}

type BrandAttributes = {
  vibe?: string[]
  palette?: string[]
  material?: string[]
  silhouette?: string[]
  detail?: string[]
  pattern?: string[]
  gender_lean?: string | null
  formality?: string | null
  price_tier?: string | null
  era_reference?: string | null
  subculture?: string | null
  confidence?: number
  reasoning?: string
}

type WikiSource = {type?: string; url?: string; title?: string}
type WikiData = {
  instagram_handle?: string | null
  instagram_url?: string | null
  homepage_url?: string | null
  founder?: string[] | null
  founded_year?: number | null
  origin_country?: string | null
  sources?: WikiSource[] | null
  confidence?: Record<string, number> | null
  review_reasons?: string[] | null
  status?: "ok" | "review" | "no_data" | null
  enriched_at?: string | null
  schema_version?: string | null
}

type Detail = {
  brand: {
    id: number
    name: string
    description: string | null
    attributes: BrandAttributes | null
    wiki: WikiData | null
    primary_style_node: NodeRef | null
    secondary_style_node: NodeRef | null
    confidence: number | null
    classify_model: string | null
    classified_at: string | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | null
    price_max_usd: number | null
  }
  stats: {product_count: number; in_stock_count: number}
  samples: Array<{
    id: string
    name: string | null
    image_url: string | null
    sale_price: number | null
    source_price: number | null
    source_currency: string | null
    category: string | null
    product_url: string | null
  }>
  similar: Array<{id: number; name: string; primary_style_node_id: number | null; similarity: number}>
  nodes_by_id: Record<number, {code: string; name_en: string}>
}

export function BrandNodeDetailDrawer({
  brandId,
  open,
  onOpenChange,
}: {
  brandId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {width, startResize} = useResizableWidth()

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (brandId == null || !open) return
    setDetail(null)
    setLoading(true)
    setError(null)
    fetch(`/api/admin/brand-graph/detail?id=${brandId}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "failed")
        return d as Detail
      })
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false))
  }, [brandId, open])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto !max-w-none sm:!max-w-none"
        style={{width: `${width}px`}}
      >
        {/* 좌측 가장자리 리사이즈 핸들 */}
        <div
          onPointerDown={startResize}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-foreground/10 active:bg-foreground/20"
          title="드래그하여 너비 조절"
          aria-label="Resize panel"
          role="separator"
        />
        <SheetHeader>
          <SheetTitle>{detail?.brand.name ?? "로딩 중…"}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            {detail?.brand.primary_style_node && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                {detail.brand.primary_style_node.code} · {detail.brand.primary_style_node.name_en}
              </span>
            )}
            {detail?.brand.secondary_style_node && (
              <span
                className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200"
                title="보조 노드"
              >
                {detail.brand.secondary_style_node.code} · {detail.brand.secondary_style_node.name_en}
              </span>
            )}
            {detail?.brand.confidence != null && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5",
                  detail.brand.confidence >= 0.85
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                    : detail.brand.confidence >= 0.7
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
                )}
              >
                신뢰도 {detail.brand.confidence.toFixed(2)}
              </span>
            )}
            {detail?.brand.classify_model && (
              <span className="text-muted-foreground/70">
                {detail.brand.classify_model}
                {detail.brand.classified_at && ` · ${new Date(detail.brand.classified_at).toLocaleDateString("ko-KR")}`}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            <span className="text-sm">상세 로딩 중…</span>
          </div>
        )}

        {error && (
          <div className="m-4 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {detail && (
          <div className="space-y-6 p-4">
            {/* 1. 통계 + 가격 (USD 통일) */}
            <section className="grid grid-cols-3 gap-2">
              <StatBox label="상품 수" value={detail.stats.product_count.toLocaleString()} />
              <StatBox label="재고 있음" value={detail.stats.in_stock_count.toLocaleString()} />
              <StatBox
                label="가격대 (USD)"
                value={fmtPriceBand(detail.brand.price_min_usd, detail.brand.price_max_usd)}
              />
            </section>

            {/* 1.5 Wiki — 브랜드 위키 메타 (SPEC-BRAND-WIKI-001 M2) */}
            <WikiSection
              brandId={detail.brand.id}
              description={detail.brand.description}
              wiki={detail.brand.wiki}
              onUpdated={(description, wiki) =>
                setDetail((d) => (d ? {...d, brand: {...d.brand, description, wiki}} : d))
              }
            />

            {/* 2. 대표 상품 */}
            {detail.samples.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">대표 상품</h3>
                  <span className="text-[11px] text-muted-foreground">상위 {detail.samples.length}개</span>
                </div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detail.samples.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/admin/products/${s.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded border bg-card transition hover:border-foreground/30"
                      >
                        {s.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.image_url}
                            alt={s.name ?? ""}
                            className="aspect-square w-full object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid aspect-square w-full place-items-center bg-muted text-[10px] text-muted-foreground">
                            no image
                          </div>
                        )}
                        <div className="space-y-0.5 p-1.5">
                          <div className="line-clamp-1 text-[11px] font-medium">{s.name ?? "(이름 없음)"}</div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{s.category ?? "—"}</span>
                            {(s.sale_price ?? s.source_price) != null && (
                              <span
                                className="tabular-nums"
                                title={`${s.source_currency ?? "?"} ${s.source_price ?? s.sale_price}`}
                              >
                                {fmtUsd(s.source_price ?? s.sale_price, s.source_currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 3. 브랜드 메타 (attributes) */}
            {detail.brand.attributes && Object.keys(detail.brand.attributes).length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">브랜드 메타</h3>

                {/* 3-1. 배열 속성 (vibe / silhouette / palette / material / detail / pattern) */}
                <dl className="space-y-1.5 text-xs">
                  {(["vibe", "silhouette", "palette", "material", "detail", "pattern"] as const).map((key) => {
                    const values = detail.brand.attributes?.[key]
                    if (!values || values.length === 0) return null
                    return (
                      <div key={key} className="grid grid-cols-[80px_1fr] gap-2">
                        <dt className="text-muted-foreground">{META_KEY_KO[key]}</dt>
                        <dd className="flex flex-wrap gap-1">
                          {values.map((v) => (
                            <span key={v} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">
                              {v}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )
                  })}
                </dl>

                {/* 3-2. 단일값 분류 (formality / price_tier / era_reference / subculture / gender_lean) */}
                {(() => {
                  const a = detail.brand.attributes
                  if (!a) return null
                  const rows: Array<[string, string]> = []
                  if (a.formality) rows.push(["포멀리티", a.formality])
                  if (a.price_tier) rows.push(["포지셔닝", a.price_tier])
                  if (a.era_reference) rows.push(["시대", a.era_reference])
                  if (a.subculture && a.subculture !== "none") rows.push(["서브컬처", a.subculture])
                  if (a.gender_lean) rows.push(["성별 추론", a.gender_lean])
                  if (rows.length === 0) return null
                  return (
                    <dl className="space-y-1.5 border-t pt-2 text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[80px_1fr] gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>
                            <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">{value}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )
                })()}

                {/* 3-3. 속성 추출 메타 (attributes.confidence + reasoning) */}
                {(detail.brand.attributes.confidence != null || detail.brand.attributes.reasoning) && (
                  <div className="space-y-1.5 border-t pt-2 text-[10px] text-muted-foreground">
                    {detail.brand.attributes.confidence != null && (
                      <div className="flex justify-between">
                        <span>속성 추출 신뢰도</span>
                        <span className="tabular-nums text-foreground">
                          {detail.brand.attributes.confidence.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {detail.brand.attributes.reasoning && (
                      <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground/80">
                        {detail.brand.attributes.reasoning}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 4. 유사 브랜드 — FashionSigLIP multimodal cosine (brand-clusters 와 동일 RPC) */}
            {detail.similar.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">유사 브랜드</h3>
                  <span className="text-[11px] text-muted-foreground">cosine top-{detail.similar.length}</span>
                </div>
                <ul className="space-y-1 text-xs">
                  {detail.similar.map((s) => {
                    const node = s.primary_style_node_id != null ? detail.nodes_by_id[s.primary_style_node_id] : null
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-foreground">{s.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {node && (
                            <span
                              className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                              title={node.name_en}
                            >
                              {node.code}
                            </span>
                          )}
                          <span className="tabular-nums text-muted-foreground">
                            {(s.similarity * 100).toFixed(1)}%
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* 5. 부가 정보 */}
            <section className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {detail.brand.gender_scope && detail.brand.gender_scope.length > 0 && (
                <Row label="성별" value={detail.brand.gender_scope.join(", ")} />
              )}
              {detail.brand.source_platforms && detail.brand.source_platforms.length > 0 && (
                <Row label="유통" value={detail.brand.source_platforms.join(", ")} />
              )}
              <Row
                label="가격대 (USD)"
                value={fmtPriceBand(detail.brand.price_min_usd, detail.brand.price_max_usd)}
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StatBox({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

const META_KEY_KO: Record<"vibe" | "silhouette" | "palette" | "material" | "detail" | "pattern", string> = {
  vibe: "무드",
  silhouette: "실루엣",
  palette: "팔레트",
  material: "소재",
  detail: "디테일",
  pattern: "패턴",
}

// ── Resizable width hook ──────────────────────────────────────
// Drawer 가로 폭을 드래그로 조절. localStorage 에 저장하여 세션 간 유지.
const RESIZE_KEY = "admin:brand-detail:width"
const MIN_W = 420
const MAX_FRAC = 0.9 // 화면의 90% 까지

function useResizableWidth() {
  const [width, setWidth] = useState<number>(720) // SSR 안전 기본값
  // mount 후 localStorage / viewport 기반 초기값으로 보정 (디폴트: 화면 절반)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = Number(typeof window !== "undefined" ? localStorage.getItem(RESIZE_KEY) : NaN)
    const vw = window.innerWidth
    const cap = Math.floor(vw * MAX_FRAC)
    const init = Number.isFinite(stored) && stored >= MIN_W ? stored : Math.floor(vw * 0.5)
    setWidth(Math.min(Math.max(MIN_W, init), cap))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let lastW = startW
    const onMove = (ev: PointerEvent) => {
      // side=right 이므로 왼쪽으로 드래그 = 폭 증가
      const dx = startX - ev.clientX
      const vw = window.innerWidth
      lastW = Math.max(MIN_W, Math.min(Math.floor(vw * MAX_FRAC), startW + dx))
      setWidth(lastW)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      document.body.style.userSelect = ""
      // 드래그 종료 시점에만 1회 persist — pointermove 마다 setItem 하지 않음
      try {
        localStorage.setItem(RESIZE_KEY, String(lastW))
      } catch {}
    }
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }
  return {width, startResize}
}

// ── Wiki section ──────────────────────────────────────────────

const STATUS_STYLE: Record<NonNullable<WikiData["status"]>, string> = {
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  review: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  no_data: "bg-muted text-muted-foreground",
}

function WikiSection({
  brandId,
  description,
  wiki,
  onUpdated,
}: {
  brandId: number
  description: string | null
  wiki: WikiData | null
  onUpdated: (description: string | null, wiki: WikiData) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showSources, setShowSources] = useState(false)

  if (!wiki) {
    return (
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Wiki</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Plus className="mr-1 size-3" /> 추가
          </Button>
        </div>
        {editing ? (
          <WikiEditor brandId={brandId} initialDescription={description} initial={{}} onCancel={() => setEditing(false)} onSaved={(d, w) => { setEditing(false); onUpdated(d, w) }} />
        ) : (
          <p className="text-xs text-muted-foreground">위키 정보 없음</p>
        )}
      </section>
    )
  }

  if (editing) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Wiki 편집</h3>
        <WikiEditor brandId={brandId} initialDescription={description} initial={wiki} onCancel={() => setEditing(false)} onSaved={(d, w) => { setEditing(false); onUpdated(d, w) }} />
      </section>
    )
  }

  const status = wiki.status ?? "ok"

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Wiki</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 size-3" /> 편집
        </Button>
      </div>

      {/* 헤더 배지 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {wiki.origin_country && (
          <span className="rounded border bg-muted/40 px-1.5 py-0.5">
            {flagOf(wiki.origin_country)} {wiki.origin_country}
          </span>
        )}
        {wiki.founded_year != null && (
          <span className="rounded border bg-muted/40 px-1.5 py-0.5 tabular-nums">est. {wiki.founded_year}</span>
        )}
        {wiki.confidence?.overall != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground tabular-nums">
            conf {wiki.confidence.overall.toFixed(2)}
          </span>
        )}
        <span className={cn("rounded px-1.5 py-0.5", STATUS_STYLE[status])}>{status}</span>
      </div>

      {/* 링크 */}
      {(wiki.instagram_url || wiki.homepage_url) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {wiki.instagram_url && (
            <a
              href={wiki.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground hover:underline"
            >
              @{wiki.instagram_handle ?? "instagram"} <ExternalLink className="size-3" />
            </a>
          )}
          {wiki.homepage_url && (
            <a
              href={wiki.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground hover:underline"
            >
              {shortHost(wiki.homepage_url)} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* description */}
      {description && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed">{description}</p>
      )}

      {/* 메타 (founder + enriched_at) */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {wiki.founder && wiki.founder.length > 0 && (
          <span>창업: {wiki.founder.join(", ")}</span>
        )}
        {wiki.enriched_at && <span title={wiki.enriched_at}>{relTime(wiki.enriched_at)}</span>}
      </div>

      {/* review reasons (status !== ok) */}
      {status !== "ok" && wiki.review_reasons && wiki.review_reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {wiki.review_reasons.map((r) => (
            <span key={r} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-900 dark:bg-rose-900/30 dark:text-rose-200">
              {r}
            </span>
          ))}
        </div>
      )}

      {/* sources (펼치기) */}
      {wiki.sources && wiki.sources.length > 0 && (
        <div className="text-[11px]">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setShowSources((v) => !v)}
          >
            {showSources ? "출처 접기" : `출처 ${wiki.sources.length}개`}
          </button>
          {showSources && (
            <ul className="mt-1 space-y-0.5">
              {wiki.sources.map((s, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="rounded border bg-muted/40 px-1 py-0.5 text-[10px]">{s.type ?? "src"}</span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground hover:text-foreground hover:underline">
                      {s.title ?? s.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{s.title ?? "(no url)"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function WikiEditor({
  brandId,
  initialDescription,
  initial,
  onCancel,
  onSaved,
}: {
  brandId: number
  initialDescription: string | null
  initial: WikiData
  onCancel: () => void
  onSaved: (description: string | null, wiki: WikiData) => void
}) {
  const [form, setForm] = useState({
    instagram_handle: initial.instagram_handle ?? "",
    instagram_url: initial.instagram_url ?? "",
    homepage_url: initial.homepage_url ?? "",
    description: initialDescription ?? "",
    founded_year: initial.founded_year != null ? String(initial.founded_year) : "",
    origin_country: initial.origin_country ?? "",
    status: (initial.status ?? "ok") as "ok" | "review" | "no_data",
  })
  const [founders, setFounders] = useState<string[]>(initial.founder ?? [])
  const [newFounder, setNewFounder] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({...f, [k]: v}))

  const submit = async () => {
    setSaving(true)
    setErr(null)
    const body: Record<string, unknown> = {
      instagram_handle: form.instagram_handle.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      homepage_url: form.homepage_url.trim() || null,
      description: form.description.trim() || null,
      origin_country: form.origin_country.trim().toUpperCase() || null,
      founder: founders.length > 0 ? founders : null,
      status: form.status,
    }
    if (form.founded_year.trim()) {
      const n = Number(form.founded_year)
      if (!Number.isInteger(n)) {
        setErr("창업연도는 정수여야 합니다")
        setSaving(false)
        return
      }
      body.founded_year = n
    } else {
      body.founded_year = null
    }
    try {
      const r = await fetch(`/api/admin/brand-nodes/${brandId}/wiki`, {
        method: "PATCH",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "save failed")
      onSaved((d.description as string | null) ?? null, d.wiki as WikiData)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2.5 rounded border bg-card p-3 text-xs">
      <Field label="IG handle">
        <Input value={form.instagram_handle} onChange={(e) => setField("instagram_handle", e.target.value)} placeholder="mulberryengland" />
      </Field>
      <Field label="IG URL">
        <Input value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} placeholder="https://instagram.com/..." />
      </Field>
      <Field label="홈페이지">
        <Input value={form.homepage_url} onChange={(e) => setField("homepage_url", e.target.value)} placeholder="https://..." />
      </Field>
      <Field label="설명">
        <Textarea rows={4} value={form.description} onChange={(e) => setField("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="국가 (ISO-2)">
          <Input value={form.origin_country} maxLength={2} onChange={(e) => setField("origin_country", e.target.value.toUpperCase())} placeholder="GB" />
        </Field>
        <Field label="창업연도">
          <Input value={form.founded_year} inputMode="numeric" onChange={(e) => setField("founded_year", e.target.value)} placeholder="1971" />
        </Field>
      </div>
      <Field label="창업자">
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {founders.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5">
                {f}
                <button type="button" onClick={() => setFounders((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newFounder}
              onChange={(e) => setNewFounder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const v = newFounder.trim()
                  if (v) {
                    setFounders((arr) => [...arr, v])
                    setNewFounder("")
                  }
                }
              }}
              placeholder="이름 입력 + Enter"
            />
          </div>
        </div>
      </Field>
      <Field label="상태">
        <select
          value={form.status}
          onChange={(e) => setField("status", e.target.value as typeof form.status)}
          className="w-full rounded border bg-background px-2 py-1"
        >
          <option value="ok">ok</option>
          <option value="review">review</option>
          <option value="no_data">no_data</option>
        </select>
      </Field>

      {err && <p className="text-rose-600">{err}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>취소</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-1 size-3 animate-spin" />}저장
        </Button>
      </div>
    </div>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function flagOf(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return ""
  const base = 0x1f1e6
  return String.fromCodePoint(base + iso2.charCodeAt(0) - 65, base + iso2.charCodeAt(1) - 65)
}

function shortHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const REL_DIV: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [30, "day"],
  [12, "month"],
  [Infinity, "year"],
]

function relTime(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (Number.isNaN(ms)) return ""
  let diff = ms / 1000
  let unit: Intl.RelativeTimeFormatUnit = "second"
  for (const [step, u] of REL_DIV) {
    if (Math.abs(diff) < step) {
      unit = u
      break
    }
    diff /= step
    unit = u
  }
  return new Intl.RelativeTimeFormat("ko", {numeric: "auto"}).format(Math.round(diff), unit)
}

function fmtPriceBand(min: number | null, max: number | null): string {
  if (min != null && max != null) return `$${Math.round(min)} ~ $${Math.round(max)}`
  if (min != null) return `≥ $${Math.round(min)}`
  if (max != null) return `≤ $${Math.round(max)}`
  return "—"
}
