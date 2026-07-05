"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import {AlertTriangle, ExternalLink, RefreshCw, Save} from "lucide-react"
import {cn} from "@/lib/utils"

type CrawlStatus =
  | "not_started"
  | "tech_detected"
  | "needs_config"
  | "config_ready"
  | "crawl_ready"
  | "crawled"
  | "qc_failed"
  | "import_ready"
  | "imported"
  | "embed_ready"
  | "embedded"
  | "active"
  | "blocked"

type ConfigStatus = "not_started" | "needed" | "ready" | "blocked"
type PlatformType = "unknown" | "cafe24" | "shopify" | "custom" | "uniqlo" | "zara" | "29cm" | "farfetch"

type Brand = {
  brand_node_id: number
  brand_name: string
  brand_name_normalized: string | null
  gender_scope: string[] | null
  source_platforms: string[] | null
  price_min_usd: number | string | null
  price_max_usd: number | string | null
  homepage_url: string | null
  wiki_status: string | null
  brand_updated_at: string | null
  status_updated_at: string | null
  has_status_row: boolean
  status: CrawlStatus
  config_status: ConfigStatus
  platform_key: string | null
  platform_type: PlatformType
  category_discovery: string
  latest_artifact_path: string | null
  qc_summary: Record<string, unknown>
  last_error: string | null
  blocked_reason: string | null
  notes: string | null
}

type Run = {
  id: number
  brand_node_id: number
  stage: string
  status: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  command: string | null
  actor: string | null
  platform_key: string | null
  metrics: Record<string, unknown>
  artifact_path: string | null
  error_message: string | null
}

type ListResponse = {
  brands: Brand[]
  runs: Run[]
  total: number
  limit: number
  offset: number
}

type Draft = Partial<Pick<Brand, "status" | "config_status" | "platform_type" | "platform_key" | "notes" | "blocked_reason">>

const CRAWL_STATUSES: CrawlStatus[] = [
  "not_started",
  "tech_detected",
  "needs_config",
  "config_ready",
  "crawl_ready",
  "crawled",
  "qc_failed",
  "import_ready",
  "imported",
  "embed_ready",
  "embedded",
  "active",
  "blocked",
]

const CONFIG_STATUSES: ConfigStatus[] = ["not_started", "needed", "ready", "blocked"]
const PLATFORM_TYPES: PlatformType[] = ["unknown", "cafe24", "shopify", "custom", "uniqlo", "zara", "29cm", "farfetch"]

const STATUS_LABEL: Record<CrawlStatus, string> = {
  not_started: "대기",
  tech_detected: "탐지됨",
  needs_config: "설정 필요",
  config_ready: "설정 완료",
  crawl_ready: "크롤 준비",
  crawled: "크롤 완료",
  qc_failed: "QC 실패",
  import_ready: "적재 준비",
  imported: "적재 완료",
  embed_ready: "임베딩 준비",
  embedded: "임베딩 완료",
  active: "활성",
  blocked: "차단",
}

const CONFIG_LABEL: Record<ConfigStatus, string> = {
  not_started: "설정 대기",
  needed: "설정 필요",
  ready: "설정 완료",
  blocked: "설정 차단",
}

const statusTone: Record<string, string> = {
  tech_detected: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  config_ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  crawl_ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  import_ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  qc_failed: "border-red-500/30 bg-red-500/10 text-red-300",
  blocked: "border-red-500/30 bg-red-500/10 text-red-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  running: "border-sky-500/30 bg-sky-500/10 text-sky-300",
}

export function ProductCollectionPage() {
  const [list, setList] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})

  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [platformFilter, setPlatformFilter] = useState("")
  const [urlFilter, setUrlFilter] = useState("")

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({limit: "100"})
    if (q.trim()) params.set("q", q.trim())
    if (statusFilter) params.set("status", statusFilter)
    if (platformFilter) params.set("platform_type", platformFilter)
    if (urlFilter) params.set("url", urlFilter)
    try {
      const res = await fetch(`/api/admin/product-collection?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ListResponse
      setList(data)
      setDrafts({})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [platformFilter, q, statusFilter, urlFilter])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const latestRunByBrand = useMemo(() => {
    const map = new Map<number, Run>()
    for (const run of list?.runs ?? []) {
      if (!map.has(run.brand_node_id)) map.set(run.brand_node_id, run)
    }
    return map
  }, [list])

  const summary = useMemo(() => {
    const brands = list?.brands ?? []
    return {
      notStarted: brands.filter((b) => b.status === "not_started").length,
      missingUrl: brands.filter((b) => !b.homepage_url).length,
      configReady: brands.filter((b) => b.status === "config_ready" || b.status === "crawl_ready").length,
      importReady: brands.filter((b) => b.status === "import_ready").length,
    }
  }, [list])

  const updateDraft = (id: number, patch: Draft) => {
    setDrafts((prev) => ({...prev, [id]: {...prev[id], ...patch}}))
  }

  const patchBrand = async (id: number, patch: Record<string, unknown>) => {
    setSaving(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/product-collection/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {error?: string}
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      await fetchList()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  const saveDraft = (brand: Brand) => {
    const draft = drafts[brand.brand_node_id]
    if (!draft) return
    patchBrand(brand.brand_node_id, draft)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label="미시작" value={summary.notStarted} />
        <Summary label="URL 없음" value={summary.missingUrl} />
        <Summary label="크롤 준비" value={summary.configReady} />
        <Summary label="적재 준비" value={summary.importReady} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="브랜드 / URL / platform key 검색"
          className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">상태 전체</option>
          {CRAWL_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
        </select>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">플랫폼 전체</option>
          {PLATFORM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select
          value={urlFilter}
          onChange={(e) => setUrlFilter(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">URL 전체</option>
          <option value="present">URL 있음</option>
          <option value="missing">URL 없음</option>
        </select>
        <button
          onClick={fetchList}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-border px-3 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">브랜드</th>
              <th className="px-3 py-2">홈페이지</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">플랫폼</th>
              <th className="px-3 py-2">QC</th>
              <th className="px-3 py-2">최근 실행</th>
              <th className="px-3 py-2 text-right">저장</th>
            </tr>
          </thead>
          <tbody>
            {loading && !list ? (
              <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>불러오는 중</td></tr>
            ) : (list?.brands.length ?? 0) === 0 ? (
              <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>대상 없음</td></tr>
            ) : (
              list!.brands.map((brand) => {
                const id = brand.brand_node_id
                const draft = drafts[id] ?? {}
                const latestRun = latestRunByBrand.get(id)
                const status = draft.status ?? brand.status
                return (
                  <tr key={id} className="border-t border-border align-top">
                    <td className="w-[240px] px-3 py-3">
                      <div className="font-medium">{brand.brand_name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">brand_node #{id}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(brand.gender_scope ?? []).map((gender) => <Badge key={gender}>{gender}</Badge>)}
                        {(brand.source_platforms ?? []).slice(0, 3).map((platform) => <Badge key={platform}>{platform}</Badge>)}
                        {priceRange(brand) && <Badge>{priceRange(brand)}</Badge>}
                      </div>
                    </td>
                    <td className="w-[240px] px-3 py-3 text-xs">
                      {brand.homepage_url ? (
                        <a
                          href={brand.homepage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-[220px] items-center gap-1 truncate text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          {brand.homepage_url}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-300">
                          <AlertTriangle className="size-3.5" />
                          URL 없음
                        </span>
                      )}
                      {brand.wiki_status && <div className="mt-1 text-muted-foreground">wiki {brand.wiki_status}</div>}
                    </td>
                    <td className="w-[210px] px-3 py-3">
                      <select
                        value={status}
                        onChange={(e) => updateDraft(id, {status: e.target.value as CrawlStatus})}
                        className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {CRAWL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                      <select
                        value={draft.config_status ?? brand.config_status}
                        onChange={(e) => updateDraft(id, {config_status: e.target.value as ConfigStatus})}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {CONFIG_STATUSES.map((s) => <option key={s} value={s}>{CONFIG_LABEL[s]}</option>)}
                      </select>
                      <StatusPill value={status} label={STATUS_LABEL[status]} />
                      {brand.last_error && <div className="mt-1 line-clamp-2 text-[11px] text-red-300">{brand.last_error}</div>}
                    </td>
                    <td className="w-[210px] px-3 py-3">
                      <input
                        value={draft.platform_key ?? brand.platform_key ?? ""}
                        onChange={(e) => updateDraft(id, {platform_key: e.target.value})}
                        placeholder="platform key"
                        className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      />
                      <select
                        value={draft.platform_type ?? brand.platform_type}
                        onChange={(e) => updateDraft(id, {platform_type: e.target.value as PlatformType})}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {PLATFORM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <div className="mt-1 text-[11px] text-muted-foreground">{brand.category_discovery}</div>
                    </td>
                    <td className="w-[170px] px-3 py-3 text-xs">
                      <QcSummary summary={brand.qc_summary} artifact={brand.latest_artifact_path} />
                    </td>
                    <td className="w-[170px] px-3 py-3 text-xs">
                      {latestRun ? (
                        <div className="space-y-1">
                          <StatusPill value={latestRun.status} label={`${latestRun.stage} ${latestRun.status}`} />
                          <div className="text-muted-foreground">{relativeTime(latestRun.started_at)}</div>
                          {latestRun.error_message && <div className="line-clamp-2 text-red-300">{latestRun.error_message}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">없음</span>
                      )}
                    </td>
                    <td className="w-[100px] px-3 py-3 text-right">
                      <button
                        onClick={() => saveDraft(brand)}
                        disabled={saving === id || !drafts[id]}
                        className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-muted/40 disabled:opacity-50"
                      >
                        <Save className="size-3.5" />
                        저장
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-md border border-border">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">최근 실행</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">시간</th>
                <th className="px-3 py-2">브랜드</th>
                <th className="px-3 py-2">단계</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">지표</th>
                <th className="px-3 py-2">에러</th>
              </tr>
            </thead>
            <tbody>
              {(list?.runs ?? []).slice(0, 30).map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{relativeTime(run.started_at)}</td>
                  <td className="px-3 py-2">{brandLabel(list?.brands ?? [], run.brand_node_id)}</td>
                  <td className="px-3 py-2">{run.stage}</td>
                  <td className="px-3 py-2"><StatusPill value={run.status} label={run.status} /></td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-muted-foreground">{formatMetrics(run.metrics)}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-red-300">{run.error_message}</td>
                </tr>
              ))}
              {(list?.runs.length ?? 0) === 0 && (
                <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>실행 이력 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Summary({label, value}: {label: string; value: number}) {
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Badge({children}: {children: React.ReactNode}) {
  return <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{children}</span>
}

function StatusPill({value, label}: {value: string; label: string}) {
  return (
    <span className={cn("mt-1 inline-flex rounded border px-1.5 py-0.5 text-[11px]", statusTone[value] ?? "border-border bg-muted/20 text-muted-foreground")}>
      {label}
    </span>
  )
}

function QcSummary({summary, artifact}: {summary: Record<string, unknown>; artifact: string | null}) {
  const total = typeof summary.total === "number" ? summary.total : null
  const colorFill = typeof summary.color_fill_rate === "number" ? summary.color_fill_rate : null
  const categoryFill = typeof summary.category_fill_rate === "number" ? summary.category_fill_rate : null
  if (total === null && !artifact) return <span className="text-muted-foreground">없음</span>
  return (
    <div className="space-y-1 text-muted-foreground">
      {total !== null && <div>상품 {total.toLocaleString()}</div>}
      {categoryFill !== null && <div>category {categoryFill.toFixed(1)}%</div>}
      {colorFill !== null && <div>color {colorFill.toFixed(1)}%</div>}
      {artifact && <div className="truncate">{artifact}</div>}
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return new Date(iso).toLocaleDateString("ko-KR")
}

function brandLabel(brands: Brand[], id: number): string {
  const brand = brands.find((b) => b.brand_node_id === id)
  return brand ? brand.brand_name : `#${id}`
}

function formatMetrics(metrics: Record<string, unknown>): string {
  const keys = ["total", "valid", "imported", "embedded", "platform_type", "color_fill_rate", "category_fill_rate"]
  const parts = keys
    .filter((key) => metrics[key] !== undefined)
    .map((key) => `${key}=${String(metrics[key])}`)
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(metrics)
}

function priceRange(brand: Brand): string | null {
  const min = brand.price_min_usd != null ? Number(brand.price_min_usd) : null
  const max = brand.price_max_usd != null ? Number(brand.price_max_usd) : null
  if (min == null && max == null) return null
  if (min != null && max != null) return `$${Math.round(min)}-${Math.round(max)}`
  if (min != null) return `$${Math.round(min)}+`
  return `~$${Math.round(max ?? 0)}`
}
