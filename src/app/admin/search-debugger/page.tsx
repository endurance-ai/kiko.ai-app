"use client"

import {useEffect, useMemo, useRef, useState} from "react"
import Image from "next/image"
import {
    ChevronRight,
    Eye,
    History,
    Image as ImageIcon,
    Languages,
    Loader2,
    Play,
    Save,
    Star,
    Trash2,
    Type,
    X
} from "lucide-react"
import {cn} from "@/lib/utils"

type Mode = "image" | "text" | "fused"

interface StyleNodeLite {
  code: string
  name_en: string
}

interface ModalTrace {
  path: "/embed" | "/embed/text"
  latency_ms: number
  ok: boolean
  status?: number
  model?: string
  dim?: number
  norm?: number
  error?: string
}

interface ResultRow {
  rank: number
  id: number
  brand: string
  name: string
  price: number | null
  original_price?: number | null
  sale_price?: number | null
  image_url: string | null
  product_url: string | null
  platform: string | null
  category?: string | null
  subcategory: string | null
  color?: string | null
  material?: string | null
  gender?: string[] | null
  distance: number
  degraded: boolean
  embedded_at: string | null
  brand_style: {primary_code: string | null; primary_name: string | null} | null
  family: string | null
  style_node_match: boolean
  family_match: boolean
}

interface RewriteTrace {
  ok: boolean
  model_used: string
  latency_ms: number
  user_message: string
  raw_tool_calls: Array<{name: string; args: Record<string, unknown>; id: string | null}>
  parsed_text_query: string | null
  parsed_tool_name: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  finish_reason: string | null
  raw_content: string | null
  error?: string | null
}

interface VisionItemTrace {
  label_ko: string | null
  category: string | null
  subcategory: string | null
  fit: string | null
  color_family: string | null
  detail: string | null
  keywords_en: string[]
  search_query: string | null
  confidence: number | null
}

interface VisionTrace {
  ok: boolean
  model_used: string
  latency_ms: number
  image_url: string
  items: VisionItemTrace[]
  picked_item_index: number | null
  mood_tags: string[]
  style_node_primary: string | null
  style_node_secondary: string | null
  error?: string | null
}

interface DebugResponse {
  stage: "ok" | "embedding" | "rpc"
  error?: string
  rewrite_trace?: RewriteTrace | {ok: false; error: string} | null
  vision_trace?: VisionTrace | {ok: false; error: string} | null
  text_used_for_embed?: string | null
  embedding_trace: {
    mode: Mode
    fused: boolean
    total_latency_ms: number
    final_norm: number | null
    modal_calls: ModalTrace[]
  }
  pipeline_trace?: {
    style_node_code: string | null
    style_node_id: number | null
    style_node_match_brands: number
    style_node_lookup_ms: number
    raw_category: string | null
    category_source?: "manual" | "vision" | "none"
    target_family: string | null
    family_match_products: number | null
    family_lookup_ms: number
    degraded: boolean | null
  }
  rpc?: {
    latency_ms: number
    returned: number
    limit: number
    candidate_count?: number
    brand_cap?: number
    ok?: boolean
  }
  results?: ResultRow[]
}

const MODE_TABS: {key: Mode; label: string; icon: typeof Type; hint: string}[] = [
  {key: "text", label: "텍스트", icon: Type, hint: "/embed/text 단독"},
  {key: "image", label: "이미지", icon: ImageIcon, hint: "/embed 단독"},
  {key: "fused", label: "융합", icon: ChevronRight, hint: "0.7·img + 0.3·txt L2-norm"},
]

export default function SearchDebuggerPage() {
  const [mode, setMode] = useState<Mode>("text")
  const [text, setText] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [styleNodeCode, setStyleNodeCode] = useState("")
  const [category, setCategory] = useState("")
  const [limit, setLimit] = useState(30)
  const [running, setRunning] = useState(false)
  const [resp, setResp] = useState<DebugResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<ResultRow | null>(null)
  const [styleNodes, setStyleNodes] = useState<StyleNodeLite[]>([])

  // 옵션 스텝
  const [runRewrite, setRunRewrite] = useState(true)
  const [rewriteModel, setRewriteModel] = useState<string>("")
  const [applyRewrite, setApplyRewrite] = useState(true)
  const [runVision, setRunVision] = useState(true)
  const [autoWireCategory, setAutoWireCategory] = useState(true)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [visionModel, setVisionModel] = useState<string>("")

  // URL resolve (IG / Pinterest)
  const [resolving, setResolving] = useState(false)
  const [resolveResult, setResolveResult] = useState<{
    detected_kind: string
    images: string[]
    latency_ms: number
    error?: string | null
  } | null>(null)
  const [pickedImageIdx, setPickedImageIdx] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 탭 + 저장
  const [tab, setTab] = useState<"run" | "history">("run")
  const [saving, setSaving] = useState(false)
  const [saveDialog, setSaveDialog] = useState(false)
  const [savedRunId, setSavedRunId] = useState<number | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [restoredBanner, setRestoredBanner] = useState<{id: number; query: string | null} | null>(null)
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch("/api/admin/style-nodes")
      .then((r) => r.json())
      .then((j) => setStyleNodes((j.nodes ?? []) as StyleNodeLite[]))
      .catch(() => {})
    fetch("/api/admin/ai-models")
      .then((r) => r.json())
      .then((j) => {
        if (j.rewrite_models) {
          setAvailableModels(j.rewrite_models as string[])
          setRewriteModel((m) => m || (j.default_rewrite_model as string) || "")
          setVisionModel(j.vision_model as string)
        }
      })
      .catch(() => {})
  }, [])

  const detectedUrlKind = useMemo<"instagram" | "pinterest" | null>(() => {
    const u = imageUrl.trim()
    if (!u) return null
    try {
      const host = new URL(u).hostname.toLowerCase()
      if (host.endsWith("instagram.com")) return "instagram"
      if (host === "pin.it" || host.endsWith("pinterest.com")) return "pinterest"
    } catch {
      return null
    }
    return null
  }, [imageUrl])

  // 실제 임베딩에 들어갈 이미지 URL — resolve 됐으면 picked, 아니면 원본
  const effectiveImageUrl = useMemo(() => {
    if (resolveResult && resolveResult.images.length > 0) {
      return resolveResult.images[pickedImageIdx] ?? resolveResult.images[0]
    }
    return imageUrl.trim()
  }, [resolveResult, pickedImageIdx, imageUrl])

  const canRun = useMemo(() => {
    if (running || resolving) return false
    if (mode === "text") return text.trim().length > 0
    if (mode === "image") return effectiveImageUrl.length > 0
    return text.trim().length > 0 && effectiveImageUrl.length > 0
  }, [running, resolving, mode, text, effectiveImageUrl])

  const doResolve = async () => {
    setResolving(true)
    setResolveResult(null)
    setPickedImageIdx(0)
    try {
      const res = await fetch("/api/admin/resolve-url", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({url: imageUrl.trim()}),
      })
      const j = await res.json()
      setResolveResult({
        detected_kind: j.detected_kind ?? "other",
        images: j.images ?? [],
        latency_ms: j.latency_ms ?? 0,
        error: j.error,
      })
    } catch (e) {
      setResolveResult({
        detected_kind: "other",
        images: [],
        latency_ms: 0,
        error: (e as Error).message,
      })
    } finally {
      setResolving(false)
    }
  }

  const run = async () => {
    setRunning(true)
    setError(null)
    setResp(null)
    setSelectedRow(null)
    setSavedRunId(null)
    setRestoredBanner(null)
    try {
      const res = await fetch("/api/admin/search-v6-debug", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          mode,
          text: text.trim() || undefined,
          image_url: effectiveImageUrl || undefined,
          style_node_code: styleNodeCode || undefined,
          category: category.trim() || undefined,
          limit,
          run_rewrite: runRewrite && mode !== "image" && text.trim().length > 0,
          rewrite_model_id: rewriteModel || undefined,
          apply_rewrite: applyRewrite,
          run_vision: runVision && mode !== "text" && effectiveImageUrl.length > 0,
          auto_wire_category: autoWireCategory,
        }),
      })
      const j = (await res.json()) as DebugResponse
      setResp(j)
      if (j.stage !== "ok") setError(j.error ?? "failed")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const restoreRun = async (run: SavedRun) => {
    // List 응답에는 response 가 안 들어있음 (가벼움 위해). 단건 fetch 로 전체 받음.
    let full: SavedRun = run
    if (!run.response) {
      try {
        const r = await fetch(`/api/admin/search-debug-runs/${run.id}`)
        if (r.ok) full = (await r.json()) as SavedRun
      } catch {
        // fallback: list 의 row 그대로
      }
    }

    setTab("run")
    setMode(full.mode)
    setText(full.query_text ?? "")
    setImageUrl(full.source_url ?? full.image_url ?? "")
    setStyleNodeCode((full.filters as {style_node_code?: string})?.style_node_code ?? "")
    setCategory((full.filters as {category?: string})?.category ?? "")
    setLimit((full.filters as {limit?: number})?.limit ?? 30)
    const s = full.steps as Record<string, unknown> | undefined
    if (s) {
      if (typeof s.run_rewrite === "boolean") setRunRewrite(s.run_rewrite)
      if (typeof s.rewrite_model_id === "string") setRewriteModel(s.rewrite_model_id)
      if (typeof s.apply_rewrite === "boolean") setApplyRewrite(s.apply_rewrite)
      if (typeof s.run_vision === "boolean") setRunVision(s.run_vision)
      if (typeof s.auto_wire_category === "boolean") setAutoWireCategory(s.auto_wire_category)
    }
    setResp(full.response as DebugResponse)
    setSavedRunId(full.id)
    setResolveResult(null)
    setSelectedRow(null)
    setError(null)
    setRestoredBanner({id: full.id, query: full.query_text})
    setTimeout(() => {
      resultsAnchorRef.current?.scrollIntoView({behavior: "smooth", block: "start"})
    }, 50)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">v6 검색 디버거</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            FashionSigLIP 임베딩 → search_products_v6 RPC 파이프라인 검증
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "run" && resp?.stage === "ok" && resp.rpc && (
            <div className="flex items-center gap-3 text-[11px] tabular-nums mr-2">
              <span className="text-muted-foreground">
                total {resp.embedding_trace.total_latency_ms + resp.rpc.latency_ms}ms
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded font-mono",
                  resp.pipeline_trace?.degraded
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-turquoise/15 text-turquoise"
                )}
              >
                {resp.pipeline_trace?.degraded ? "degraded" : "full-precision"}
              </span>
            </div>
          )}
          {tab === "run" && resp?.stage === "ok" && (
            <button
              onClick={() => setSaveDialog(true)}
              disabled={saving}
              className="h-8 px-3 rounded-md border border-turquoise/40 bg-turquoise/10 text-turquoise text-xs hover:bg-turquoise/20 transition-colors flex items-center gap-1.5"
            >
              <Save className="size-3.5" />
              {savedRunId ? "저장됨" : "저장"}
            </button>
          )}
          {/* Tab switcher */}
          <div className="flex border border-border rounded-md overflow-hidden text-xs">
            <button
              onClick={() => setTab("run")}
              className={cn(
                "px-3 py-1.5 transition-colors flex items-center gap-1",
                tab === "run" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Play className="size-3" /> Run
            </button>
            <button
              onClick={() => setTab("history")}
              className={cn(
                "px-3 py-1.5 transition-colors flex items-center gap-1 border-l border-border",
                tab === "history" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="size-3" /> History
            </button>
          </div>
        </div>
      </div>

      {tab === "history" ? (
        <HistoryTab onRestore={restoreRun} refreshKey={historyRefresh} />
      ) : (
      <>

      {/* Input panel */}
      <section className="border border-border bg-card rounded-md p-4 space-y-3">
        <div className="flex gap-1.5">
          {MODE_TABS.map(({key, label, icon: Icon, hint}) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors",
                mode === key
                  ? "border-turquoise/40 bg-turquoise/10 text-turquoise"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
              title={hint}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground/60 self-center">
            {MODE_TABS.find((t) => t.key === mode)?.hint}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={cn("space-y-1", mode === "image" && "opacity-40 pointer-events-none")}>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              쿼리 텍스트
            </label>
            <textarea
              rows={2}
              placeholder="black wool overcoat, oversized fit..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full text-sm border border-border rounded-md bg-background px-2.5 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 resize-none"
            />
          </div>
          <div className={cn("space-y-1", mode === "text" && "opacity-40 pointer-events-none")}>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              이미지 URL
              <span className="text-[9px] text-muted-foreground/60 normal-case">
                CDN URL 또는 Instagram / Pinterest 포스트 URL
              </span>
            </label>
            <div className="flex gap-1.5">
              <input
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value)
                  setResolveResult(null)
                }}
                className="flex-1 h-8 text-sm border border-border rounded-md bg-background px-2.5 placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
              />
              {detectedUrlKind && (
                <button
                  onClick={doResolve}
                  disabled={resolving}
                  className="h-8 px-2.5 rounded-md border border-turquoise/40 bg-turquoise/10 text-turquoise text-[11px] hover:bg-turquoise/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {resolving ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <>📌 {detectedUrlKind === "instagram" ? "IG" : "Pin"} resolve</>
                  )}
                </button>
              )}
            </div>
            {imageUrl && (
              <div className="relative h-24 w-24 mt-1 border border-border rounded overflow-hidden bg-muted">
                <Image
                  src={detectedUrlKind ? `/api/admin/proxy-image?url=${encodeURIComponent(imageUrl)}` : imageUrl}
                  alt="preview"
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Resolve result picker */}
        {resolveResult && (
          <div className="border border-border bg-background/40 rounded-md p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                {resolveResult.detected_kind === "instagram" ? "📷 Instagram" : resolveResult.detected_kind === "pinterest" ? "📌 Pinterest" : "🔗 URL"}
                {" "}resolve · {resolveResult.latency_ms}ms · {resolveResult.images.length}장
              </span>
              {resolveResult.error && (
                <span className="text-red-400/80 text-[10px]">{resolveResult.error}</span>
              )}
            </div>
            {resolveResult.images.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {resolveResult.images.map((u, i) => (
                  <button
                    key={i}
                    onClick={() => setPickedImageIdx(i)}
                    className={cn(
                      "relative w-16 h-20 rounded overflow-hidden border-2 bg-muted transition-colors",
                      pickedImageIdx === i
                        ? "border-turquoise"
                        : "border-transparent hover:border-foreground/30"
                    )}
                  >
                    <Image
                      src={`/api/admin/proxy-image?url=${encodeURIComponent(u)}`}
                      alt={`slide ${i + 1}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    {pickedImageIdx === i && (
                      <span className="absolute top-0.5 left-0.5 text-[9px] bg-turquoise text-background px-1 rounded font-mono">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-amber-400/80">이미지 못 가져옴 — URL 비공개·만료·Apify 토큰 미설정 등</p>
            )}
          </div>
        )}

        {/* Step toggles */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">스텝</span>
          {/* LLM Rewrite toggle */}
          <label
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border cursor-pointer transition-colors",
              mode === "image" && "opacity-40 cursor-not-allowed",
              runRewrite && mode !== "image"
                ? "border-turquoise/40 bg-turquoise/10 text-turquoise"
                : "border-border text-muted-foreground"
            )}
          >
            <input
              type="checkbox"
              checked={runRewrite}
              disabled={mode === "image"}
              onChange={(e) => setRunRewrite(e.target.checked)}
              className="size-3"
            />
            <Languages className="size-3" />
            LLM rewrite
          </label>
          {runRewrite && mode !== "image" && (
            <>
              <select
                value={rewriteModel}
                onChange={(e) => setRewriteModel(e.target.value)}
                className="h-7 text-[11px] border border-border rounded bg-background px-2 font-mono"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyRewrite}
                  onChange={(e) => setApplyRewrite(e.target.checked)}
                  className="size-3"
                />
                임베딩에 적용
              </label>
            </>
          )}
          <span className="mx-1 h-4 w-px bg-border/60" />
          {/* Vision toggle */}
          <label
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border cursor-pointer transition-colors",
              mode === "text" && "opacity-40 cursor-not-allowed",
              runVision && mode !== "text"
                ? "border-turquoise/40 bg-turquoise/10 text-turquoise"
                : "border-border text-muted-foreground"
            )}
          >
            <input
              type="checkbox"
              checked={runVision}
              disabled={mode === "text"}
              onChange={(e) => setRunVision(e.target.checked)}
              className="size-3"
            />
            <Eye className="size-3" />
            Vision analyze
          </label>
          {runVision && mode !== "text" && visionModel && (
            <span className="text-[10px] font-mono text-muted-foreground">{visionModel}</span>
          )}
          <span className="mx-1 h-4 w-px bg-border/60" />
          {/* Auto-wire category toggle */}
          <label
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border cursor-pointer transition-colors",
              autoWireCategory
                ? "border-turquoise/40 bg-turquoise/10 text-turquoise"
                : "border-border text-muted-foreground"
            )}
            title="Vision/Rewrite 결과의 category 를 자동으로 RPC p_category 에 전달 (production 봇 동작)"
          >
            <input
              type="checkbox"
              checked={autoWireCategory}
              onChange={(e) => setAutoWireCategory(e.target.checked)}
              className="size-3"
            />
            자동 와이어링 (category)
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-border/50">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Top-K
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 30)))}
              className="h-8 text-xs border border-border rounded-md bg-background px-2 w-[80px] tabular-nums"
            />
          </div>
          <button
            onClick={run}
            disabled={!canRun}
            className="h-8 px-4 rounded-md bg-turquoise/15 text-turquoise text-xs font-medium hover:bg-turquoise/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ml-auto"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run
          </button>
        </div>

        {/* Advanced override (collapsible) */}
        <div className="pt-1 border-t border-border/50">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? "▼" : "▶"} Advanced override (수동 probe)
          </button>
          {showAdvanced && (
            <div className="mt-2 flex flex-wrap items-end gap-3 p-2 rounded-md bg-background/40 border border-border/40">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  스타일 노드
                  <span className="text-[9px] text-amber-400/70 normal-case">실험용 — production RPC 미사용</span>
                </label>
                <select
                  value={styleNodeCode}
                  onChange={(e) => setStyleNodeCode(e.target.value)}
                  className="h-8 text-xs border border-border rounded-md bg-background px-2 min-w-[180px]"
                >
                  <option value="">(없음)</option>
                  {styleNodes.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.code} · {n.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  카테고리 수동 override
                  <span className="text-[9px] text-muted-foreground/60 normal-case">Vision 자동 와이어링 덮어씀</span>
                </label>
                <input
                  placeholder="e.g. Sneakers / Outer / ..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 text-xs border border-border rounded-md bg-background px-2 w-[180px]"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="border border-red-400/30 bg-red-950/20 text-red-400 text-xs rounded-md p-3">
          {error}
        </div>
      )}

      {restoredBanner && resp && (
        <div
          ref={resultsAnchorRef}
          className="border border-turquoise/30 bg-turquoise/5 text-turquoise text-xs rounded-md px-3 py-2 flex items-center justify-between"
        >
          <span>
            ↻ History #{restoredBanner.id} 복원됨
            {restoredBanner.query && (
              <span className="text-muted-foreground ml-2">— &ldquo;{restoredBanner.query}&rdquo;</span>
            )}
          </span>
          <button
            onClick={() => setRestoredBanner(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {resp && (resp.rewrite_trace || resp.vision_trace) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {resp.rewrite_trace && <RewritePanel trace={resp.rewrite_trace} applied={resp.text_used_for_embed} originalText={text} />}
          {resp.vision_trace && <VisionPanel trace={resp.vision_trace} />}
        </div>
      )}

      {resp && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <EmbeddingPanel trace={resp.embedding_trace} />
          {resp.pipeline_trace && (
            <PipelinePanel trace={resp.pipeline_trace} />
          )}
          <RpcPanel rpc={resp.rpc} returned={resp.results?.length ?? 0} />
        </div>
      )}

      {resp?.results && resp.results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <ResultsTable
              rows={resp.results}
              selectedId={selectedRow?.id ?? null}
              onSelect={setSelectedRow}
            />
          </div>
          <div>
            <DetailPanel row={selectedRow} />
          </div>
        </div>
      )}

      {resp?.stage === "ok" && resp.results && resp.results.length === 0 && (
        <div className="border border-amber-500/30 bg-amber-950/10 text-amber-400 text-xs rounded-md p-3">
          결과 없음 — 필터가 너무 좁거나 임베딩이 매칭 안 됨
        </div>
      )}
      </>
      )}

      {saveDialog && resp?.stage === "ok" && (
        <SaveDialog
          mode={mode}
          queryText={text}
          imageUrl={effectiveImageUrl}
          sourceUrl={resolveResult ? imageUrl.trim() : null}
          filters={{
            style_node_code: styleNodeCode || null,
            category: category.trim() || null,
            limit,
          }}
          steps={{
            run_rewrite: runRewrite,
            rewrite_model_id: rewriteModel,
            apply_rewrite: applyRewrite,
            run_vision: runVision,
            auto_wire_category: autoWireCategory,
          }}
          response={resp}
          existingId={savedRunId}
          onClose={() => setSaveDialog(false)}
          onSaved={(id) => {
            setSavedRunId(id)
            setSaveDialog(false)
            setHistoryRefresh((n) => n + 1)
          }}
          setSaving={setSaving}
        />
      )}
    </div>
  )
}

function EmbeddingPanel({trace}: {trace: DebugResponse["embedding_trace"]}) {
  return (
    <section className="border border-border bg-card rounded-md p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          1. Embedding
        </h2>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {trace.total_latency_ms}ms
        </span>
      </div>
      <div className="space-y-1">
        <Row label="mode" value={trace.mode} />
        <Row label="fused" value={trace.fused ? "yes (0.7·img + 0.3·txt)" : "no"} />
        {trace.final_norm != null && (
          <Row
            label="L2 norm"
            value={trace.final_norm.toFixed(4)}
            mono
            ok={Math.abs(trace.final_norm - 1) < 0.01}
          />
        )}
      </div>
      <div className="pt-2 border-t border-border/50 space-y-1.5">
        {trace.modal_calls.map((c, i) => (
          <div key={i} className="text-[11px] space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-muted-foreground">{c.path}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono",
                  c.ok ? "bg-turquoise/15 text-turquoise" : "bg-red-400/15 text-red-400"
                )}
              >
                {c.ok ? `${c.status ?? "ok"}` : "FAIL"} · {c.latency_ms}ms
              </span>
            </div>
            {c.ok ? (
              <div className="text-[10px] text-muted-foreground tabular-nums pl-2">
                {c.model} · dim {c.dim} · norm {c.norm?.toFixed(4)}
              </div>
            ) : (
              <div className="text-[10px] text-red-400/80 pl-2 break-all">{c.error}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function PipelinePanel({trace}: {trace: NonNullable<DebugResponse["pipeline_trace"]>}) {
  return (
    <section className="border border-border bg-card rounded-md p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
        2. Pipeline (v6 3-stage ladder)
      </h2>
      <div className="space-y-2">
        <Stage
          label="FILTER 1 — style_node"
          subtitle={
            trace.style_node_code
              ? `code=${trace.style_node_code} → id=${trace.style_node_id ?? "—"}`
              : "(no filter)"
          }
          metric={
            trace.style_node_code
              ? `${trace.style_node_match_brands.toLocaleString()} brands`
              : "skipped"
          }
          dimmed={!trace.style_node_code}
        />
        <Stage
          label="FILTER 2 — category family gate"
          subtitle={
            trace.raw_category
              ? `"${trace.raw_category}" → family ${trace.target_family ?? "(unmapped)"}${trace.category_source === "vision" ? " · auto-wired from Vision" : trace.category_source === "manual" ? " · manual override" : ""}`
              : "(no filter)"
          }
          metric={
            trace.target_family && trace.target_family !== "other"
              ? trace.family_match_products != null
                ? `${trace.family_match_products.toLocaleString()} raw cats in family`
                : "—"
              : trace.target_family === "other"
                ? "other (gate absent)"
                : "skipped"
          }
          dimmed={!trace.raw_category}
        />
        <Stage
          label="FILTER 3 — in_stock + has embedding"
          subtitle="cosine ASC, created_at DESC tiebreak"
          metric="applied in RPC"
        />
      </div>
      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">degraded</span>
        <span
          className={cn(
            "px-2 py-0.5 rounded font-mono",
            trace.degraded
              ? "bg-amber-500/15 text-amber-400"
              : trace.degraded === false
                ? "bg-turquoise/15 text-turquoise"
                : "bg-muted text-muted-foreground"
          )}
        >
          {trace.degraded === true ? "true" : trace.degraded === false ? "false" : "—"}
        </span>
      </div>
    </section>
  )
}

function RpcPanel({rpc, returned}: {rpc?: DebugResponse["rpc"]; returned: number}) {
  return (
    <section className="border border-border bg-card rounded-md p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
          3. RPC
        </h2>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {rpc?.latency_ms ?? 0}ms
        </span>
      </div>
      <Row label="function" value="search_products_v6" mono />
      <Row label="returned" value={`${returned} / ${rpc?.limit ?? "?"}`} mono />
      {rpc?.candidate_count != null && (
        <Row label="candidate pool" value={`${rpc.candidate_count}`} mono />
      )}
      {rpc?.brand_cap != null && (
        <Row label="brand cap" value={`${rpc.brand_cap} / brand`} mono />
      )}
      <div className="pt-2 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          RPC = ladder + cosine 검색 단일 호출. degraded = false 는 full-precision (node+family 매칭), true 는 어딘가에서 relaxed.
        </p>
      </div>
    </section>
  )
}

function ResultsTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ResultRow[]
  selectedId: number | null
  onSelect: (r: ResultRow) => void
}) {
  return (
    <section className="border border-border bg-card rounded-md overflow-hidden">
      <div className="border-b border-border px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
        Results · top {rows.length}
      </div>
      <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-card border-b border-border/60">
            <tr className="text-muted-foreground text-left">
              <th className="px-2 py-1.5 w-8">#</th>
              <th className="px-2 py-1.5">product ID</th>
              <th className="px-2 py-1.5 w-12"></th>
              <th className="px-2 py-1.5">brand · name</th>
              <th className="px-2 py-1.5">cat / family</th>
              <th className="px-2 py-1.5">brand style</th>
              <th className="px-2 py-1.5 text-right">distance</th>
              <th className="px-2 py-1.5 text-right">price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.rank}-${r.id}`}
                onClick={() => onSelect(r)}
                className={cn(
                  "border-b border-border/40 cursor-pointer hover:bg-foreground/5",
                  selectedId === r.id && "bg-turquoise/10"
                )}
              >
                <td className="px-2 py-1.5 text-muted-foreground">{r.rank}</td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">
                  {r.id}
                </td>
                <td className="px-2 py-1.5">
                  <ProductImage
                    src={r.image_url}
                    alt={r.name}
                    className="relative w-8 h-10 rounded overflow-hidden bg-muted"
                    sizes="32px"
                  />
                </td>
                <td className="px-2 py-1.5 max-w-[260px]">
                  <div className="text-foreground truncate">{r.brand}</div>
                  <div className="text-muted-foreground truncate text-[10px]">{r.name}</div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-foreground/90">{r.category ?? r.subcategory ?? "—"}</div>
                  <div className="text-muted-foreground text-[10px]">
                    {r.family ?? "—"}
                    {r.family_match && <span className="text-turquoise ml-1">✓</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-foreground/90">
                    {r.brand_style?.primary_code ?? "—"}
                  </span>
                  {r.style_node_match && <span className="text-turquoise ml-1">✓</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-turquoise">
                  {r.distance.toFixed(4)}
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">
                  {r.price ? `₩${r.price.toLocaleString()}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DetailPanel({row}: {row: ResultRow | null}) {
  if (!row) {
    return (
      <section className="border border-dashed border-border rounded-md p-6 text-center">
        <p className="text-xs text-muted-foreground">테이블 행을 클릭해 상세 보기</p>
      </section>
    )
  }
  return (
    <section className="border border-border bg-card rounded-md overflow-hidden">
      <ProductImage
        src={row.image_url}
        alt={row.name}
        className="aspect-[3/4] relative bg-muted"
        sizes="(min-width: 1024px) 33vw, 100vw"
      />
      <div className="p-3 space-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            #{row.rank} · distance {row.distance.toFixed(4)}
          </p>
          <p className="text-sm font-bold mt-0.5">{row.brand}</p>
          <p className="text-xs text-muted-foreground">{row.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-border/50">
          <Row label="price" value={row.price ? `₩${row.price.toLocaleString()}` : "—"} mono />
          <Row label="product ID" value={`${row.id}`} mono />
          <Row label="platform" value={row.platform ?? "—"} mono />
          <Row label="category" value={row.category ?? "—"} mono />
          {row.color && <Row label="color" value={row.color} mono />}
          {row.material && <Row label="material" value={row.material} mono />}
          <Row
            label="family"
            value={row.family ?? "—"}
            mono
            ok={row.family_match}
          />
          <Row
            label="brand style"
            value={row.brand_style?.primary_code ?? "—"}
            mono
            ok={row.style_node_match}
          />
          <Row label="degraded" value={row.degraded ? "yes" : "no"} mono />
        </div>
        {row.embedded_at && (
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            embedded {new Date(row.embedded_at).toLocaleString("ko-KR")}
          </p>
        )}
        {row.product_url && (
          <a
            href={row.product_url}
            target="_blank"
            rel="noreferrer"
            className="block text-center text-[11px] text-turquoise hover:underline pt-1"
          >
            상품 페이지 ↗
          </a>
        )}
      </div>
    </section>
  )
}

function ProductImage({
  src,
  alt,
  className,
  sizes,
}: {
  src: string | null
  alt: string
  className: string
  sizes: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const safeSrc = isHttpImageUrl(src) ? src : null

  return (
    <div className={className}>
      {safeSrc && failedSrc !== safeSrc ? (
        <Image
          src={safeSrc}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          className="object-contain"
          onError={() => setFailedSrc(safeSrc)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
          <ImageIcon className="size-4" />
        </div>
      )}
    </div>
  )
}

function isHttpImageUrl(value: string | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function Row({
  label,
  value,
  mono,
  ok,
}: {
  label: string
  value: string
  mono?: boolean
  ok?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          mono && "font-mono",
          ok === true && "text-turquoise",
          ok === false && "text-amber-400"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Stage({
  label,
  subtitle,
  metric,
  dimmed,
}: {
  label: string
  subtitle: string
  metric: string
  dimmed?: boolean
}) {
  return (
    <div className={cn("space-y-0.5", dimmed && "opacity-50")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-foreground/90">{label}</span>
        <span className="text-[10px] tabular-nums font-mono text-turquoise">{metric}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/70">{subtitle}</p>
    </div>
  )
}

function RewritePanel({
  trace,
  applied,
  originalText,
}: {
  trace: RewriteTrace | {ok: false; error: string}
  applied?: string | null
  originalText: string
}) {
  const isOk = "ok" in trace && trace.ok
  const failed = !isOk
  const t = isOk ? (trace as RewriteTrace) : null
  const wasApplied = isOk && applied && applied !== originalText
  return (
    <section className="border border-border bg-card rounded-md p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Languages className="size-3" /> 0a. LLM Rewrite
        </h2>
        {t && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{t.latency_ms}ms</span>
        )}
      </div>
      {failed ? (
        <div className="text-[11px] text-red-400/90">
          {(trace as {error?: string}).error ?? "failed"}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <Row label="model" value={t!.model_used} mono />
            <Row
              label="tokens"
              value={`${t!.prompt_tokens ?? "?"} in / ${t!.completion_tokens ?? "?"} out`}
              mono
            />
            <Row label="finish" value={t!.finish_reason ?? "—"} mono />
          </div>
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                input
              </span>
              <p className="text-[12px] mt-0.5 break-words">{t!.user_message}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                parsed text_query
                {wasApplied ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-turquoise/15 text-turquoise font-mono">
                    APPLIED
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    not applied
                  </span>
                )}
              </span>
              <p className="text-[13px] mt-0.5 font-mono text-turquoise break-words">
                {t!.parsed_text_query ?? <span className="text-muted-foreground">(none)</span>}
              </p>
            </div>
            {t!.raw_tool_calls.length > 0 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  tool_calls ({t!.raw_tool_calls.length})
                </summary>
                <pre className="mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto">
                  {JSON.stringify(t!.raw_tool_calls, null, 2)}
                </pre>
              </details>
            )}
            {t!.raw_content && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  raw LLM content
                </summary>
                <p className="mt-1 p-2 bg-background/50 rounded text-[11px] whitespace-pre-wrap">
                  {t!.raw_content}
                </p>
              </details>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function VisionPanel({trace}: {trace: VisionTrace | {ok: false; error: string}}) {
  const isOk = "ok" in trace && trace.ok
  const t = isOk ? (trace as VisionTrace) : null
  return (
    <section className="border border-border bg-card rounded-md p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Eye className="size-3" /> 0b. Vision Analyze
        </h2>
        {t && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{t.latency_ms}ms</span>
        )}
      </div>
      {!isOk ? (
        <div className="text-[11px] text-red-400/90">
          {(trace as {error?: string}).error ?? "failed"}
        </div>
      ) : (
        <>
          <Row label="model" value={t!.model_used} mono />
          {(t!.style_node_primary || t!.style_node_secondary) && (
            <Row
              label="style"
              value={`${t!.style_node_primary ?? "—"} / ${t!.style_node_secondary ?? "—"}`}
              mono
            />
          )}
          {t!.mood_tags.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">mood</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {t!.mood_tags.map((m) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              detected items ({t!.items.length})
            </span>
            {t!.items.map((it, i) => (
              <div
                key={i}
                className={cn(
                  "border rounded p-2 text-[11px] space-y-0.5",
                  i === t!.picked_item_index
                    ? "border-turquoise/40 bg-turquoise/5"
                    : "border-border"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono">
                    {it.category ?? "?"} · {it.subcategory ?? "?"}
                  </span>
                  {i === t!.picked_item_index && (
                    <span className="text-[9px] text-turquoise font-mono">PICKED</span>
                  )}
                </div>
                {it.detail && <p className="text-muted-foreground">{it.detail}</p>}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground/80">
                  {it.fit && <span>fit: {it.fit}</span>}
                  {it.color_family && <span>color: {it.color_family}</span>}
                </div>
                {it.search_query && (
                  <p className="font-mono text-turquoise text-[10px]">→ &ldquo;{it.search_query}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// History 관련 타입 + 컴포넌트
// ──────────────────────────────────────────────────────────────────────

interface SavedRun {
  id: number
  created_at: string
  created_by: string | null
  mode: Mode
  query_text: string | null
  image_url: string | null
  source_url: string | null
  filters: Record<string, unknown>
  steps: Record<string, unknown>
  response: unknown
  rating: number | null
  notes: string | null
  tags: string[]
}

function StarRating({
  value,
  onChange,
  size = 16,
}: {
  value: number | null
  onChange?: (v: number | null) => void
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value ?? 0
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value === n ? null : n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(null)}
          className={cn(
            "transition-colors",
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default"
          )}
        >
          <Star
            style={{width: size, height: size}}
            className={cn(
              n <= display ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  )
}

function SaveDialog({
  mode,
  queryText,
  imageUrl,
  sourceUrl,
  filters,
  steps,
  response,
  existingId,
  onClose,
  onSaved,
  setSaving,
}: {
  mode: Mode
  queryText: string
  imageUrl: string
  sourceUrl: string | null
  filters: Record<string, unknown>
  steps: Record<string, unknown>
  response: unknown
  existingId: number | null
  onClose: () => void
  onSaved: (id: number) => void
  setSaving: (v: boolean) => void
}) {
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setSaving(true)
    setError(null)
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
      let res: Response
      if (existingId) {
        res = await fetch(`/api/admin/search-debug-runs/${existingId}`, {
          method: "PATCH",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({rating, notes: notes || null, tags}),
        })
      } else {
        res = await fetch("/api/admin/search-debug-runs", {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({
            mode,
            query_text: queryText || null,
            image_url: imageUrl || null,
            source_url: sourceUrl,
            filters,
            steps,
            response,
            rating,
            notes: notes || null,
            tags,
          }),
        })
      }
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "save failed")
      onSaved(existingId ?? j.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="border border-border bg-card rounded-lg p-5 w-[480px] space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{existingId ? "리뷰 수정" : "Run 저장"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            별점
          </label>
          <div>
            <StarRating value={rating} onChange={setRating} size={22} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            메모
          </label>
          <textarea
            rows={3}
            placeholder="결과에 대한 코멘트 — 어떤 부분이 좋았고 / 부족했는지"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs border border-border rounded-md bg-background px-2.5 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 resize-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            태그 (쉼표 구분)
          </label>
          <input
            placeholder="korean-query, fanout-test, brand-diversity..."
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full h-8 text-xs border border-border rounded-md bg-background px-2.5 placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          />
        </div>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-8 px-4 rounded-md bg-turquoise/15 text-turquoise text-xs font-medium hover:bg-turquoise/25 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="size-3 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryTab({
  onRestore,
  refreshKey,
}: {
  onRestore: (run: SavedRun) => void | Promise<void>
  refreshKey: number
}) {
  const [runs, setRuns] = useState<SavedRun[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterRating, setFilterRating] = useState<string>("")
  const [filterMode, setFilterMode] = useState<string>("")
  const [filterTag, setFilterTag] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setLoading(true)
    })
    const params = new URLSearchParams({limit: "50"})
    if (filterRating) params.set("rating", filterRating)
    if (filterMode) params.set("mode", filterMode)
    if (filterTag) params.set("tag", filterTag)
    fetch(`/api/admin/search-debug-runs?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        setRuns((j.runs ?? []) as SavedRun[])
        setTotal(j.total ?? 0)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [refreshKey, filterRating, filterMode, filterTag])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const r of runs) for (const t of r.tags) s.add(t)
    return Array.from(s).sort()
  }, [runs])

  const remove = async (id: number) => {
    if (!confirm("이 Run 삭제할까?")) return
    const res = await fetch(`/api/admin/search-debug-runs/${id}`, {method: "DELETE"})
    if (res.ok) {
      setRuns((rs) => rs.filter((r) => r.id !== id))
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">총 {total}건</span>
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
          className="h-7 border border-border rounded bg-background px-2 text-xs"
        >
          <option value="">모드 전체</option>
          <option value="text">텍스트</option>
          <option value="image">이미지</option>
          <option value="fused">융합</option>
        </select>
        <select
          value={filterRating}
          onChange={(e) => setFilterRating(e.target.value)}
          className="h-7 border border-border rounded bg-background px-2 text-xs"
        >
          <option value="">별점 전체</option>
          <option value="5">★★★★★</option>
          <option value="4">★★★★</option>
          <option value="3">★★★</option>
          <option value="2">★★</option>
          <option value="1">★</option>
        </select>
        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="h-7 border border-border rounded bg-background px-2 text-xs"
          >
            <option value="">태그 전체</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        {(filterRating || filterMode || filterTag) && (
          <button
            onClick={() => {
              setFilterRating("")
              setFilterMode("")
              setFilterTag("")
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            필터 초기화
          </button>
        )}
        {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      {runs.length === 0 && !loading ? (
        <div className="border border-dashed border-border rounded-md p-8 text-center text-xs text-muted-foreground">
          저장된 Run 이 없음. 디버거에서 검색 후 저장하면 여기 보임.
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <HistoryRow key={r.id} run={r} onRestore={onRestore} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryRow({
  run,
  onRestore,
  onDelete,
}: {
  run: SavedRun
  onRestore: (run: SavedRun) => void | Promise<void>
  onDelete: (id: number) => void
}) {
  const summary = useMemo(() => {
    const resp = run.response as DebugResponse | null
    if (!resp || resp.stage !== "ok" || !resp.results || resp.results.length === 0) return null
    const distances = resp.results.map((r) => r.distance)
    return {
      returned: resp.results.length,
      distMin: Math.min(...distances),
      distMax: Math.max(...distances),
      degraded: resp.pipeline_trace?.degraded,
      family: resp.pipeline_trace?.target_family,
    }
  }, [run.response])

  const modeIcon =
    run.mode === "text" ? <Type className="size-3" /> : run.mode === "image" ? <ImageIcon className="size-3" /> : <ChevronRight className="size-3" />

  return (
    <div
      onClick={() => onRestore(run)}
      className="border border-border bg-card rounded-md p-3 space-y-1.5 hover:border-foreground/40 hover:bg-foreground/5 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{new Date(run.created_at).toLocaleString("ko-KR")}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {modeIcon} {run.mode}
            </span>
            {run.created_by && (
              <>
                <span>·</span>
                <span>{run.created_by}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StarRating value={run.rating} size={12} />
            {run.query_text && (
              <span className="text-sm truncate">{run.query_text}</span>
            )}
            {run.source_url && (
              <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
                {run.source_url}
              </span>
            )}
          </div>
          {summary && (
            <div className="flex items-center gap-3 text-[10px] tabular-nums text-muted-foreground">
              <span>returned {summary.returned}</span>
              <span>
                distance {summary.distMin.toFixed(3)} ~ {summary.distMax.toFixed(3)}
              </span>
              {summary.family && (
                <span>
                  family: <span className="text-foreground/80">{summary.family}</span>
                </span>
              )}
              <span
                className={cn(
                  "px-1 rounded font-mono",
                  summary.degraded
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-turquoise/15 text-turquoise"
                )}
              >
                {summary.degraded ? "degraded" : "full"}
              </span>
            </div>
          )}
          {run.notes && (
            <p className="text-[11px] text-foreground/80 bg-background/40 rounded px-2 py-1">
              💬 {run.notes}
            </p>
          )}
          {run.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {run.tags.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(run.id)
            }}
            className="h-7 w-7 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/40 flex items-center justify-center"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
