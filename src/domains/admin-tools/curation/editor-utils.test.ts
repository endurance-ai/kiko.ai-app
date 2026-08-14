import {describe, expect, it} from "vitest"
import {
  appendProductIds,
  getEditorialActivationBlocker,
  moveProductId,
  parseProductIds,
} from "./editor-utils"

describe("curation editor helpers", () => {
  it("parses mixed separators, keeps order, and removes duplicates", () => {
    expect(parseProductIds("713929, 673348\n713929 / 672995")).toEqual([713929, 673348, 672995])
  })

  it("appends only new ids and reports the 20 item overflow", () => {
    const current = Array.from({length: 18}, (_, i) => i + 1)
    const result = appendProductIds(current, [18, 19, 20, 21, 22])
    expect(result.ids).toEqual(Array.from({length: 20}, (_, i) => i + 1))
    expect(result.duplicateCount).toBe(1)
    expect(result.overflowCount).toBe(2)
  })

  it("moves a product without changing the remaining order", () => {
    expect(moveProductId([10, 20, 30, 40], 3, 1)).toEqual([10, 40, 20, 30])
    expect(moveProductId([10, 20], -1, 0)).toEqual([10, 20])
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
