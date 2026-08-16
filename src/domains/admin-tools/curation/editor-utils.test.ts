import {describe, expect, it} from "vitest"
import {
  appendProductIds,
  getEditorialActivationBlocker,
  moveCurationSection,
  parseProductIds,
} from "./editor-utils"

describe("curation editor helpers", () => {
  it("moves a section and normalizes the saved order", () => {
    const sections = [
      {section_id: "first", sort_order: 10},
      {section_id: "second", sort_order: 20},
      {section_id: "third", sort_order: 30},
    ]

    expect(moveCurationSection(sections, "third", "first")).toEqual([
      {section_id: "third", sort_order: 1},
      {section_id: "first", sort_order: 2},
      {section_id: "second", sort_order: 3},
    ])
    expect(sections[0].sort_order).toBe(10)
  })

  it("parses mixed separators, keeps order, and removes duplicates", () => {
    expect(parseProductIds("713929, 673348\n713929 / 672995")).toEqual([713929, 673348, 672995])
  })

  it("appends only new ids and reports the overflow past the limit", () => {
    const current = Array.from({length: 18}, (_, i) => i + 1)
    const result = appendProductIds(current, [18, 19, 20, 21, 22], 20)
    expect(result.ids).toEqual(Array.from({length: 20}, (_, i) => i + 1))
    expect(result.duplicateCount).toBe(1)
    expect(result.overflowCount).toBe(2)
  })

  it("accepts more than 20 ids at the default limit", () => {
    const incoming = Array.from({length: 84}, (_, i) => i + 1)
    const result = appendProductIds([], incoming)
    expect(result.ids).toHaveLength(84)
    expect(result.overflowCount).toBe(0)
  })

  it("blocks activation when a product is missing or ineligible", () => {
    expect(getEditorialActivationBlocker([], [], [])).toContain("1개 이상")
    expect(getEditorialActivationBlocker([10], [], [10])).toContain("10")
    expect(
      getEditorialActivationBlocker([10], [{product_id: 10, eligible: false}], [])
    ).toContain("10")
    expect(
      getEditorialActivationBlocker([10], [{product_id: 10, eligible: true}], [])
    ).toBeNull()
  })
})
