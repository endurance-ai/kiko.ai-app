export const SEARCH_DEBUG_BRAND_CAP = 2

type SearchResultIdentity = {
  id: number
  brand: string
  image_url?: string | null
}

export function diversifySearchResults<T extends SearchResultIdentity>(
  rows: T[],
  limit: number,
  brandCap = SEARCH_DEBUG_BRAND_CAP
): T[] {
  const safeLimit = Math.max(0, limit)
  const safeBrandCap = Math.max(1, brandCap)
  const seenIds = new Set<number>()
  const seenImageUrls = new Set<string>()
  const brandCounts = new Map<string, number>()
  const results: T[] = []

  for (const row of rows) {
    if (seenIds.has(row.id)) continue
    const imageKey = row.image_url?.trim() ?? ""
    if (imageKey && seenImageUrls.has(imageKey)) continue

    const brandKey = row.brand.trim().toLocaleLowerCase()
    const brandCount = brandCounts.get(brandKey) ?? 0
    if (brandKey && brandCount >= safeBrandCap) continue

    results.push(row)
    seenIds.add(row.id)
    if (imageKey) seenImageUrls.add(imageKey)
    if (brandKey) brandCounts.set(brandKey, brandCount + 1)
    if (results.length >= safeLimit) break
  }

  return results
}

export function isHttpImageUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
