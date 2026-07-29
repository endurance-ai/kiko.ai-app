import "server-only"
import {logger} from "@/lib/logger"

const AI_API_URL = process.env.AI_API_URL || process.env.AI_SERVER_URL
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN
const TIMEOUT_MS = 120_000
const EDITORIAL_TIMEOUT_MS = 180_000

export interface RewriteResponse {
  ok: boolean
  model_used: string
  latency_ms: number
  system_prompt?: string | null
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

export interface VisionItemTrace {
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

export interface VisionResponse {
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

export interface ModelsResponse {
  rewrite_models: string[]
  default_rewrite_model: string | null
  vision_model: string
}

export interface ResolveResponse {
  ok: boolean
  source_url: string
  detected_kind: "instagram" | "pinterest" | "other"
  latency_ms: number
  images: string[]
  error?: string | null
}

export interface EditorialQuery {
  label: string
  query: string
  category: string
}

export interface EditorialCandidate {
  id: number
  brand: string
  name: string
  price: number
  image_url: string
  product_url: string | null
  platform: string | null
  subcategory: string | null
  distance: number
  degraded: boolean
  matched_query: string
  query_label: string
  concept_score: number
  image_quality_score: number
  editorial_score: number
  review_reason: string
}

export interface EditorialCandidatesResponse {
  ok: boolean
  concept: string
  gender: "women" | "men" | "unisex"
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

async function postAi<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = TIMEOUT_MS
): Promise<T | {ok: false; error: string}> {
  if (!AI_API_URL) {
    return {ok: false, error: "AI_API_URL not configured"}
  }
  const url = `${AI_API_URL.replace(/\/$/, "")}${path}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  const headers: Record<string, string> = {"content-type": "application/json"}
  if (INTERNAL_API_TOKEN) headers["X-Internal-Token"] = INTERNAL_API_TOKEN
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    if (!res.ok) {
      // 응답 본문은 서버에만 남기고 클라이언트엔 status 만 노출 (ai/ 내부 메시지 누출 방지)
      const text = await res.text().catch(() => "")
      logger.warn(`[ai-client] ${path} HTTP ${res.status}: ${text.slice(0, 500)}`)
      return {ok: false, error: `upstream HTTP ${res.status}`}
    }
    return (await res.json()) as T
  } catch (err) {
    logger.warn(`[ai-client] ${path} failed: ${(err as Error).message}`)
    return {ok: false, error: "upstream unreachable"}
  } finally {
    clearTimeout(timer)
  }
}

async function getAi<T>(path: string): Promise<T | {ok: false; error: string}> {
  if (!AI_API_URL) return {ok: false, error: "AI_API_URL not configured"}
  const url = `${AI_API_URL.replace(/\/$/, "")}${path}`
  const headers: Record<string, string> = {}
  if (INTERNAL_API_TOKEN) headers["X-Internal-Token"] = INTERNAL_API_TOKEN
  try {
    const res = await fetch(url, {headers})
    if (!res.ok) return {ok: false, error: `HTTP ${res.status}`}
    return (await res.json()) as T
  } catch (err) {
    return {ok: false, error: (err as Error).message}
  }
}

export function rewriteQuery(params: {
  user_text: string
  model_id?: string
  include_system_prompt?: boolean
}): Promise<RewriteResponse | {ok: false; error: string}> {
  return postAi<RewriteResponse>("/debug/rewrite-query", params)
}

export function visionAnalyze(params: {
  image_url: string
}): Promise<VisionResponse | {ok: false; error: string}> {
  return postAi<VisionResponse>("/debug/vision-analyze", params)
}

export function listAiModels(): Promise<ModelsResponse | {ok: false; error: string}> {
  return getAi<ModelsResponse>("/debug/models")
}

export function resolveUrl(params: {url: string}): Promise<ResolveResponse | {ok: false; error: string}> {
  return postAi<ResolveResponse>("/debug/resolve-url", params)
}

export function generateEditorialCandidates(params: {
  concept: string
  gender: "women" | "men" | "unisex"
  limit: number
}): Promise<EditorialCandidatesResponse | {ok: false; error: string}> {
  return postAi<EditorialCandidatesResponse>(
    "/debug/editorial-candidates",
    params,
    EDITORIAL_TIMEOUT_MS
  )
}
