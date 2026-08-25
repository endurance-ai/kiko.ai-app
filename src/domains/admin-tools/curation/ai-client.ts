import "server-only"
import {logger} from "@/lib/logger"

// 큐레이션 구좌 어드민 백엔드는 ai-server 가 소유한다 (`/admin/curation/*`).
// 구좌 데이터(ai.curation_sections)와 검증 로직(하이드레이션 술어, 구좌 간
// 중복 제거 재현, auto 구좌 소유권)이 전부 거기 있어서, 여기서 Postgres 를
// 직접 읽으면 규칙이 두 벌로 갈린다. 검색 디버거가 /debug/* 를 쓰는 것과 같은 구조.

const AI_API_URL = process.env.AI_API_URL || process.env.AI_SERVER_URL
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN
const TIMEOUT_MS = 30_000

export type Gender = "women" | "men"
export type SlotType = "auto" | "editorial"
export type DisplayType = "default" | "trending"

export interface SectionRow {
  section_id: string
  gender: Gender
  slot_type: SlotType
  display_type: DisplayType
  title: string
  subtitle: string | null
  sort_order: number
  is_active: boolean
  product_ids: number[]
  /** 이 구좌만 놓고 봤을 때 카드로 뜰 수 있는 상품 수 (품절·이미지·가격·성별 필터 통과분). */
  live_count: number
}

export interface PreviewSection {
  section_id: string
  gender: Gender
  display_type: DisplayType
  title: string
  sort_order: number
  /** 앞 구좌가 먼저 가져간 상품을 뺀, 앱에 실제로 노출되는 수. */
  shown: number
}

export interface ProductRow {
  product_id: number
  brand: string
  name: string
  price: number | null
  image_url: string
  in_stock: boolean
  /** false 면 이 구좌에서 카드로 뜨지 않는다. */
  eligible: boolean
}

export type AiError = {ok: false; error: string}

function isError<T>(v: T | AiError): v is AiError {
  return typeof v === "object" && v !== null && (v as AiError).ok === false
}

export {isError as isAiError}

async function callAi<T>(
  path: string,
  init: {method?: string; body?: unknown} = {}
): Promise<T | AiError> {
  if (!AI_API_URL) return {ok: false, error: "AI_API_URL not configured"}
  const url = `${AI_API_URL.replace(/\/$/, "")}${path}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const headers: Record<string, string> = {"content-type": "application/json"}
  if (INTERNAL_API_TOKEN) headers["X-Internal-Token"] = INTERNAL_API_TOKEN
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctl.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      logger.warn(`[curation-admin] ${path} HTTP ${res.status}: ${text.slice(0, 500)}`)
      // 409/422 는 운영자가 다시 불러오거나 입력을 고칠 수 있게 이유를 보여준다.
      if (res.status === 409 || res.status === 422) {
        return {ok: false, error: text.slice(0, 300) || "입력값이 올바르지 않습니다"}
      }
      return {ok: false, error: `upstream HTTP ${res.status}`}
    }
    return (await res.json()) as T
  } catch (err) {
    logger.warn(`[curation-admin] ${path} failed: ${(err as Error).message}`)
    return {ok: false, error: "upstream unreachable"}
  } finally {
    clearTimeout(timer)
  }
}

export function listSections(gender: Gender): Promise<{sections: SectionRow[]} | AiError> {
  return callAi<{sections: SectionRow[]}>(`/admin/curation/sections?gender=${gender}`)
}

export function previewFeed(gender: Gender): Promise<{sections: PreviewSection[]} | AiError> {
  return callAi<{sections: PreviewSection[]}>(`/admin/curation/preview?gender=${gender}`)
}

export function lookupProducts(
  gender: Gender,
  ids: number[]
): Promise<{products: ProductRow[]; missing: number[]} | AiError> {
  return callAi(`/admin/curation/products?gender=${gender}&ids=${ids.join(",")}`)
}

export function saveSection(payload: Omit<SectionRow, "live_count">): Promise<SectionRow | AiError> {
  return callAi<SectionRow>("/admin/curation/sections", {method: "PUT", body: payload})
}

export function reorderSections(
  gender: Gender,
  sectionIds: string[]
): Promise<{updated: number} | AiError> {
  return callAi("/admin/curation/sections/order", {
    method: "PATCH",
    body: {gender, section_ids: sectionIds},
  })
}

export function deleteSection(
  sectionId: string,
  gender: Gender
): Promise<{deleted: boolean} | AiError> {
  return callAi(`/admin/curation/sections/${encodeURIComponent(sectionId)}/${gender}`, {
    method: "DELETE",
  })
}
