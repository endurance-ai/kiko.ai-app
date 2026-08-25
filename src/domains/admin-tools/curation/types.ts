export type Gender = "women" | "men"
export type SlotType = "auto" | "editorial"
export type DisplayType = "default" | "trending"

export type CurationSection = {
  section_id: string
  gender: Gender
  slot_type: SlotType
  display_type: DisplayType
  title: string
  subtitle: string | null
  sort_order: number
  is_active: boolean
  product_ids: number[]
  live_count: number
  shown: number
}

// ai-server `/admin/curation/products` 가 `eligible` 과 같은 술어에서 계산해 준다.
// 여기서 in_stock/price 로 추론하지 않는다 — 노출 조건은 서버가 단일 소스다.
export type IneligibleReason = "out_of_stock" | "no_image" | "price_too_low" | "gender_mismatch"

export type CurationProduct = {
  product_id: number
  brand: string
  name: string
  price: number | null
  image_url: string
  in_stock: boolean
  eligible: boolean
  ineligible_reason: IneligibleReason | null
}
