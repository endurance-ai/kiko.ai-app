"use client"

import {useState} from "react"
import Image from "next/image"
import {ExternalLink, ImageIcon, Loader2, Sparkles} from "lucide-react"
import {cn} from "@/lib/utils"

type Gender = "women" | "men" | "unisex"

interface EditorialQuery {
  label: string
  query: string
  category: string
}

interface EditorialCandidate {
  id: number
  brand: string
  name: string
  price: number
  image_url: string
  product_url: string | null
  platform: string | null
  distance: number
  matched_query: string
  query_label: string
  concept_score: number
  image_quality_score: number
  editorial_score: number
  review_reason: string
}

interface EditorialResponse {
  ok: boolean
  concept: string
  gender: Gender
  summary: string
  queries: EditorialQuery[]
  candidates: EditorialCandidate[]
  recall_count: number
  reviewed_count: number
  rejected_count: number
  latency_ms: number
  planner_model: string | null
  reviewer_model: string | null
  error?: string | null
}

export function EditorialCandidatesPanel() {
  const [concept, setConcept] = useState("")
  const [gender, setGender] = useState<Gender>("women")
  const [limit, setLimit] = useState(30)
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState<EditorialResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())

  const run = async () => {
    const trimmed = concept.trim()
    if (trimmed.length < 2 || running) return
    setRunning(true)
    setError(null)
    setResponse(null)
    setFailedImages(new Set())
    try {
      const result = await fetch("/api/admin/editorial-candidates", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({concept: trimmed, gender, limit}),
      })
      const json = (await result.json()) as EditorialResponse
      setResponse(json)
      if (!result.ok || !json.ok) setError(json.error ?? `HTTP ${result.status}`)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-card rounded-md p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="size-4 text-turquoise" />
              자연어 에디토리얼 후보
            </h2>
            <p className="text-[11px] text-muted-foreground mt-1">
              콘셉트를 여러 상품 축으로 분해해 검색한 뒤, Vision이 실제 이미지의
              콘셉트 적합도와 품질을 재검수합니다.
            </p>
          </div>
          <span className="text-[10px] text-amber-400/80 border border-amber-400/20 rounded px-2 py-1">
            Vision 검수로 최대 1~3분 소요
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_130px_100px_auto] gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              큐레이션 콘셉트
            </label>
            <textarea
              rows={2}
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              placeholder="예: 지금 뜨는 베트남 핫걸 ST, 휴양지에서 입을 수 있는 섹시하고 키치한 무드"
              className="w-full text-sm border border-border rounded-md bg-background px-2.5 py-2 placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Gender
            </label>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value as Gender)}
              className="h-9 w-full text-xs border border-border rounded-md bg-background px-2"
            >
              <option value="women">women</option>
              <option value="men">men</option>
              <option value="unisex">unisex</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              후보 수
            </label>
            <input
              type="number"
              min={6}
              max={48}
              value={limit}
              onChange={(event) =>
                setLimit(Math.min(48, Math.max(6, Number(event.target.value) || 30)))
              }
              className="h-9 w-full text-xs border border-border rounded-md bg-background px-2 tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={run}
            disabled={running || concept.trim().length < 2}
            className="h-9 px-4 rounded-md bg-turquoise/15 text-turquoise text-xs font-medium hover:bg-turquoise/25 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            후보 생성
          </button>
        </div>
      </section>

      {error && (
        <div className="border border-red-400/30 bg-red-950/20 text-red-400 text-xs rounded-md p-3">
          {error}
        </div>
      )}

      {response?.ok && (
        <>
          <section className="border border-border bg-card rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{response.summary || response.concept}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  planner {response.planner_model ?? "—"} · reviewer{" "}
                  {response.reviewer_model ?? "—"} ·{" "}
                  {(response.latency_ms / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="flex gap-2 text-[11px] tabular-nums">
                <Metric label="검색 회수" value={response.recall_count} />
                <Metric label="Vision 검수" value={response.reviewed_count} />
                <Metric label="최종 후보" value={response.candidates.length} accent />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
              {response.queries.map((query) => (
                <div
                  key={query.query}
                  className="rounded border border-border bg-background/50 px-2 py-1"
                >
                  <span className="text-[10px] text-turquoise">{query.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">
                    {query.query}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {response.candidates.length > 0 ? (
            <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {response.candidates.map((candidate) => {
                const imageFailed = failedImages.has(candidate.id)
                return (
                  <article
                    key={candidate.id}
                    className="border border-border bg-card rounded-md overflow-hidden"
                  >
                    <div className="relative aspect-[3/4] bg-muted">
                      {!imageFailed ? (
                        <Image
                          src={candidate.image_url}
                          alt={candidate.name}
                          fill
                          sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
                          unoptimized
                          className="object-contain"
                          onError={() =>
                            setFailedImages((previous) => {
                              const next = new Set(previous)
                              next.add(candidate.id)
                              return next
                            })
                          }
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
                          <ImageIcon className="size-6" />
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white font-mono">
                        ID {candidate.id}
                      </span>
                      <span className="absolute top-1.5 right-1.5 rounded bg-turquoise/90 px-1.5 py-0.5 text-[10px] text-background font-bold">
                        {candidate.editorial_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2.5 space-y-2">
                      <div>
                        <p className="text-xs font-semibold truncate">{candidate.brand}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {candidate.name}
                        </p>
                        <p className="text-[11px] mt-0.5 tabular-nums">
                          ₩{candidate.price.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded bg-background/50 px-2 py-1.5 space-y-1">
                        <p className="text-[10px] text-turquoise truncate">
                          {candidate.query_label} · {candidate.matched_query}
                        </p>
                        <div className="flex gap-2 text-[9px] text-muted-foreground tabular-nums">
                          <span>concept {candidate.concept_score}</span>
                          <span>image {candidate.image_quality_score}</span>
                        </div>
                        {candidate.review_reason && (
                          <p className="text-[10px] text-muted-foreground line-clamp-2">
                            {candidate.review_reason}
                          </p>
                        )}
                      </div>
                      {candidate.product_url && (
                        <a
                          href={candidate.product_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1 text-[10px] text-turquoise hover:underline"
                        >
                          상품 보기 <ExternalLink className="size-2.5" />
                        </a>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>
          ) : (
            <div className="border border-amber-500/30 bg-amber-950/10 text-amber-400 text-xs rounded-md p-3">
              Vision 품질 기준을 통과한 상품이 없습니다. 콘셉트를 조금 더 구체적으로
              작성해 주세요.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded border px-2.5 py-1.5",
        accent
          ? "border-turquoise/30 bg-turquoise/10 text-turquoise"
          : "border-border bg-background/40"
      )}
    >
      <span className="text-[9px] text-muted-foreground block">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
