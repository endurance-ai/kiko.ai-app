// ai-server `SectionPayload.product_ids` 의 max_length 와 같은 값. 넘기면 거기서
// 422 가 나므로 화면에서 먼저 막는다. 예전 값 20 은 서버가 앞 20개만 노출하던
// 시절의 것으로, 지금은 넣은 만큼 전부 나간다 (ai-server#193).
export const MAX_CURATION_PRODUCTS = 200
export const CURATION_WARNING_MIN = 12

export function parseProductIds(text: string): number[] {
  return [...new Set((text.match(/\d+/g) ?? []).map(Number).filter(Number.isSafeInteger))]
}

export function appendProductIds(
  current: number[],
  incoming: number[],
  limit = MAX_CURATION_PRODUCTS
): {ids: number[]; duplicateCount: number; overflowCount: number} {
  const seen = new Set(current)
  const additions: number[] = []
  let duplicateCount = 0

  for (const id of incoming) {
    if (seen.has(id)) {
      duplicateCount += 1
      continue
    }
    seen.add(id)
    additions.push(id)
  }

  const capacity = Math.max(0, limit - current.length)
  return {
    ids: [...current, ...additions.slice(0, capacity)],
    duplicateCount,
    overflowCount: Math.max(0, additions.length - capacity),
  }
}

export function moveProductId(ids: number[], from: number, to: number): number[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function getEditorialActivationBlocker(
  ids: number[],
  products: Array<{product_id: number; eligible: boolean}>,
  missing: number[]
): string | null {
  if (ids.length === 0) return "활성 구좌에는 상품을 1개 이상 등록해야 합니다."
  if (missing.length > 0) return `존재하지 않는 상품 ID가 있습니다: ${missing.join(", ")}`

  const productById = new Map(products.map((product) => [product.product_id, product]))
  const unavailable = ids.filter((id) => !productById.get(id)?.eligible)
  if (unavailable.length > 0) {
    return `노출 조건을 충족하지 않는 상품이 있습니다: ${unavailable.join(", ")}`
  }
  return null
}
