import {describe, expect, it} from "vitest"
import {diversifySearchResults, isHttpImageUrl} from "./result-diversity"

type Row = {id: number; brand: string; distance: number; image_url?: string | null}

describe("diversifySearchResults", () => {
  it("preserves relevance order while limiting each brand", () => {
    const rows: Row[] = [
      {id: 1, brand: "A", distance: 0.1},
      {id: 2, brand: "A", distance: 0.2},
      {id: 3, brand: "A", distance: 0.3},
      {id: 4, brand: "B", distance: 0.4},
      {id: 5, brand: "B", distance: 0.5},
      {id: 6, brand: "C", distance: 0.6},
    ]

    expect(diversifySearchResults(rows, 10).map((row) => row.id)).toEqual([
      1, 2, 4, 5, 6,
    ])
  })

  it("matches brand names case-insensitively and removes duplicate ids", () => {
    const rows: Row[] = [
      {id: 1, brand: "Brand", distance: 0.1},
      {id: 1, brand: "Brand", distance: 0.1},
      {id: 2, brand: " brand ", distance: 0.2},
      {id: 3, brand: "BRAND", distance: 0.3},
      {id: 4, brand: "Other", distance: 0.4},
    ]

    expect(diversifySearchResults(rows, 10).map((row) => row.id)).toEqual([1, 2, 4])
  })

  it("removes products that reuse the same representative image", () => {
    const rows: Row[] = [
      {id: 1, brand: "A", distance: 0.1, image_url: "https://cdn.example.com/a.jpg"},
      {id: 2, brand: "A", distance: 0.2, image_url: "https://cdn.example.com/a.jpg"},
      {id: 3, brand: "B", distance: 0.3, image_url: "https://cdn.example.com/b.jpg"},
    ]

    expect(diversifySearchResults(rows, 10).map((row) => row.id)).toEqual([1, 3])
  })

  it("stops at the requested result limit", () => {
    const rows: Row[] = [
      {id: 1, brand: "A", distance: 0.1},
      {id: 2, brand: "B", distance: 0.2},
      {id: 3, brand: "C", distance: 0.3},
    ]

    expect(diversifySearchResults(rows, 2)).toHaveLength(2)
  })

  it("accepts only renderable HTTP image URLs", () => {
    expect(isHttpImageUrl("https://cdn.example.com/product.jpg")).toBe(true)
    expect(isHttpImageUrl("http://cdn.example.com/product.jpg")).toBe(true)
    expect(isHttpImageUrl("javascript:alert(1)")).toBe(false)
    expect(isHttpImageUrl("not-a-url")).toBe(false)
    expect(isHttpImageUrl(null)).toBe(false)
  })
})
