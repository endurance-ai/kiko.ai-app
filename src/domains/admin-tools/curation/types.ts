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

export type CurationProduct = {
  product_id: number
  brand: string
  name: string
  price: number | null
  image_url: string
  in_stock: boolean
  eligible: boolean
}
