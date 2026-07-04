"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import {ExternalLink, Plus, RefreshCw, Save, Send} from "lucide-react"
import {cn} from "@/lib/utils"

type PlannerStatus =
  | "planner_draft"
  | "planner_classified"
  | "product_collection_requested"
  | "cancelled"

type TechStatus =
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
type PriceBand = "unknown" | "budget" | "mid" | "premium" | "luxury"

type Target = {
  id: number
  brand_name: string
  homepage_url: string
  gender_scope: string[]
  price_band: PriceBand
  priority: number
  planner_status: PlannerStatus
  planner_notes: string | null
  requested_at: string | null
  platform_key: string | null
  platform_type: PlatformType
  category_discovery: string
  tech_status: TechStatus
  config_status: ConfigStatus
  latest_artifact_path: string | null
  qc_summary: Record<string, unknown>
  last_error: string | null
  blocked_reason: string | null
  tech_notes: string | null
  updated_at: string
}

type Run = {
  id: number
  target_id: number | null
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
  targets: Target[]
  runs: Run[]
  total: number
  limit: number
  offset: number
}

type Draft = Partial<Pick<Target, "planner_status" | "tech_status" | "config_status" | "platform_type" | "platform_key" | "tech_notes" | "blocked_reason">>

const PLANNER_STATUSES: PlannerStatus[] = [
  "planner_draft",
  "planner_classified",
  "product_collection_requested",
  "cancelled",
]

const TECH_STATUSES: TechStatus[] = [
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
const PRICE_BANDS: PriceBand[] = ["unknown", "budget", "mid", "premium", "luxury"]
const GENDERS = ["women", "men", "unisex"] as const

const PLANNER_LABEL: Record<PlannerStatus, string> = {
  planner_draft: "초안",
  planner_classified: "기획 분류",
  product_collection_requested: "수집 요청",
  cancelled: "취소",
}

const TECH_LABEL: Record<TechStatus, string> = {
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

const PRICE_LABEL: Record<PriceBand, string> = {
  unknown: "미정",
  budget: "저가",
  mid: "중가",
  premium: "프리미엄",
  luxury: "럭셔리",
}

const statusTone: Record<string, string> = {
  product_collection_requested: "border-sky-500/30 bg-sky-500/10 text-sky-300",
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
  const [saving, setSaving] = useState<number | "new" | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})

  const [q, setQ] = useState("")
  const [plannerFilter, setPlannerFilter] = useState("")
  const [techFilter, setTechFilter] = useState("")

  const [brandName, setBrandName] = useState("")
  const [homepageUrl, setHomepageUrl] = useState("")
  const [genderScope, setGenderScope] = useState<string[]>(["women"])
  const [priceBand, setPriceBand] = useState<PriceBand>("mid")
  const [priority, setPriority] = useState(3)
  const [plannerNotes, setPlannerNotes] = useState("")

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({limit: "100"})
    if (q.trim()) params.set("q", q.trim())
    if (plannerFilter) params.set("planner_status", plannerFilter)
    if (techFilter) params.set("tech_status", techFilter)
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
  }, [plannerFilter, q, techFilter])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const latestRunByTarget = useMemo(() => {
    const map = new Map<number, Run>()
    for (const run of list?.runs ?? []) {
      if (run.target_id && !map.has(run.target_id)) map.set(run.target_id, run)
    }
    return map
  }, [list])

  const summary = useMemo(() => {
    const targets = list?.targets ?? []
    return {
      requested: targets.filter((t) => t.planner_status === "product_collection_requested").length,
      crawlReady: targets.filter((t) => t.tech_status === "crawl_ready").length,
      importReady: targets.filter((t) => t.tech_status === "import_ready").length,
      active: targets.filter((t) => t.tech_status === "active").length,
    }
  }, [list])

  const updateDraft = (id: number, patch: Draft) => {
    setDrafts((prev) => ({...prev, [id]: {...prev[id], ...patch}}))
  }

  const createTarget = async () => {
    if (!brandName.trim() || !homepageUrl.trim()) return
    setSaving("new")
    setError(null)
    try {
      const res = await fetch("/api/admin/product-collection", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          brand_name: brandName,
          homepage_url: homepageUrl,
          gender_scope: genderScope,
          price_band: priceBand,
          priority,
          planner_notes: plannerNotes,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {error?: string}
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setBrandName("")
      setHomepageUrl("")
      setGenderScope(["women"])
      setPriceBand("mid")
      setPriority(3)
      setPlannerNotes("")
      await fetchList()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  const patchTarget = async (id: number, patch: Record<string, unknown>) => {
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

  const saveDraft = (target: Target) => {
    const draft = drafts[target.id]
    if (!draft) return
    patchTarget(target.id, draft)
  }

  const toggleGender = (gender: string) => {
    setGenderScope((prev) => (
      prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender]
    ))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label="수집 요청" value={summary.requested} />
        <Summary label="크롤 준비" value={summary.crawlReady} />
        <Summary label="적재 준비" value={summary.importReady} />
        <Summary label="활성" value={summary.active} />
      </div>

      <section className="rounded-md border border-border bg-muted/10 p-3">
        <div className="grid gap-2 lg:grid-cols-[1.1fr_1.4fr_1fr_1fr_80px_auto]">
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="브랜드명"
            className="h-9 rounded border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
          />
          <input
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="공식몰 URL"
            className="h-9 rounded border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
          />
          <div className="flex h-9 items-center gap-1 rounded border border-border bg-background px-2">
            {GENDERS.map((gender) => (
              <label key={gender} className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={genderScope.includes(gender)}
                  onChange={() => toggleGender(gender)}
                />
                {gender}
              </label>
            ))}
          </div>
          <select
            value={priceBand}
            onChange={(e) => setPriceBand(e.target.value as PriceBand)}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
          >
            {PRICE_BANDS.map((band) => <option key={band} value={band}>{PRICE_LABEL[band]}</option>)}
          </select>
          <input
            type="number"
            min={1}
            max={5}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
          />
          <button
            onClick={createTarget}
            disabled={saving === "new" || !brandName.trim() || !homepageUrl.trim()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-border bg-foreground px-3 text-sm text-background disabled:opacity-50"
          >
            <Plus className="size-4" />
            등록
          </button>
        </div>
        <textarea
          value={plannerNotes}
          onChange={(e) => setPlannerNotes(e.target.value)}
          placeholder="기획 메모"
          className="mt-2 min-h-16 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
      </section>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="브랜드 / URL / platform key 검색"
          className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        <select
          value={plannerFilter}
          onChange={(e) => setPlannerFilter(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">기획 전체</option>
          {PLANNER_STATUSES.map((status) => <option key={status} value={status}>{PLANNER_LABEL[status]}</option>)}
        </select>
        <select
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">기술 전체</option>
          {TECH_STATUSES.map((status) => <option key={status} value={status}>{TECH_LABEL[status]}</option>)}
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
              <th className="px-3 py-2">기획</th>
              <th className="px-3 py-2">기술</th>
              <th className="px-3 py-2">플랫폼</th>
              <th className="px-3 py-2">QC</th>
              <th className="px-3 py-2">최근 실행</th>
              <th className="px-3 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && !list ? (
              <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>불러오는 중</td></tr>
            ) : (list?.targets.length ?? 0) === 0 ? (
              <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>대상 없음</td></tr>
            ) : (
              list!.targets.map((target) => {
                const draft = drafts[target.id] ?? {}
                const latestRun = latestRunByTarget.get(target.id)
                const plannerStatus = draft.planner_status ?? target.planner_status
                const techStatus = draft.tech_status ?? target.tech_status
                return (
                  <tr key={target.id} className="border-t border-border align-top">
                    <td className="w-[260px] px-3 py-3">
                      <div className="font-medium">{target.brand_name}</div>
                      <a
                        href={target.homepage_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-[240px] items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                        {target.homepage_url}
                      </a>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {target.gender_scope.map((gender) => <Badge key={gender}>{gender}</Badge>)}
                        <Badge>{PRICE_LABEL[target.price_band]}</Badge>
                        <Badge>P{target.priority}</Badge>
                      </div>
                    </td>
                    <td className="w-[190px] px-3 py-3">
                      <select
                        value={plannerStatus}
                        onChange={(e) => updateDraft(target.id, {planner_status: e.target.value as PlannerStatus})}
                        className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {PLANNER_STATUSES.map((status) => <option key={status} value={status}>{PLANNER_LABEL[status]}</option>)}
                      </select>
                      <StatusPill value={plannerStatus} label={PLANNER_LABEL[plannerStatus]} />
                      {target.requested_at && <div className="mt-1 text-[11px] text-muted-foreground">{relativeTime(target.requested_at)}</div>}
                    </td>
                    <td className="w-[190px] px-3 py-3">
                      <select
                        value={techStatus}
                        onChange={(e) => updateDraft(target.id, {tech_status: e.target.value as TechStatus})}
                        className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {TECH_STATUSES.map((status) => <option key={status} value={status}>{TECH_LABEL[status]}</option>)}
                      </select>
                      <select
                        value={draft.config_status ?? target.config_status}
                        onChange={(e) => updateDraft(target.id, {config_status: e.target.value as ConfigStatus})}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {CONFIG_STATUSES.map((status) => <option key={status} value={status}>config {status}</option>)}
                      </select>
                      {target.last_error && <div className="mt-1 line-clamp-2 text-[11px] text-red-300">{target.last_error}</div>}
                    </td>
                    <td className="w-[210px] px-3 py-3">
                      <input
                        value={draft.platform_key ?? target.platform_key ?? ""}
                        onChange={(e) => updateDraft(target.id, {platform_key: e.target.value})}
                        placeholder="platform key"
                        className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      />
                      <select
                        value={draft.platform_type ?? target.platform_type}
                        onChange={(e) => updateDraft(target.id, {platform_type: e.target.value as PlatformType})}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs"
                      >
                        {PLATFORM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </td>
                    <td className="w-[170px] px-3 py-3 text-xs">
                      <QcSummary summary={target.qc_summary} artifact={target.latest_artifact_path} />
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
                    <td className="w-[160px] px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {target.planner_status !== "product_collection_requested" && (
                          <button
                            onClick={() => patchTarget(target.id, {planner_status: "product_collection_requested"})}
                            disabled={saving === target.id}
                            className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-muted/40 disabled:opacity-50"
                          >
                            <Send className="size-3.5" />
                            요청
                          </button>
                        )}
                        <button
                          onClick={() => saveDraft(target)}
                          disabled={saving === target.id || !drafts[target.id]}
                          className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-muted/40 disabled:opacity-50"
                        >
                          <Save className="size-3.5" />
                          저장
                        </button>
                      </div>
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
                <th className="px-3 py-2">대상</th>
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
                  <td className="px-3 py-2">{targetLabel(list?.targets ?? [], run.target_id)}</td>
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

function targetLabel(targets: Target[], id: number | null): string {
  if (!id) return "-"
  const target = targets.find((t) => t.id === id)
  return target ? target.brand_name : `#${id}`
}

function formatMetrics(metrics: Record<string, unknown>): string {
  const keys = ["total", "valid", "imported", "embedded", "platform_type", "color_fill_rate", "category_fill_rate"]
  const parts = keys
    .filter((key) => metrics[key] !== undefined)
    .map((key) => `${key}=${String(metrics[key])}`)
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(metrics)
}
