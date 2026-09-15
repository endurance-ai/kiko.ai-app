import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchProductDetail } from "../_lib/chat-stream"
import { track } from "@/lib/analytics"
import ProductPdp, { type PdpTarget } from "./ProductPdp"

vi.mock("../_lib/chat-stream", () => ({ fetchProductDetail: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const target: PdpTarget = {
  id: 42,
  fallback: { brand: "AURALEE", name: "Coat", price: 100_000, img: "https://img.example/42.jpg" },
}

describe("ProductPdp outbound attribution", () => {
  beforeEach(() => {
    vi.mocked(fetchProductDetail).mockResolvedValue({
      id: 42,
      brand: "AURALEE",
      name: "Coat",
      price: 100_000,
      image_url: "https://img.example/42.jpg",
      product_url: "https://slowsteadyclub.com/product/detail.html?product_no=42",
      similar: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it.each([
    ["search PDP", "c33ea542-5b87-4f7f-9672-e6dfde695669"],
    ["non-search PDP", null],
  ])("adds the expected thread_id for %s", async (_label, threadId) => {
    render(
      <ProductPdp
        target={target}
        threadId={threadId}
        onClose={() => undefined}
        onRequery={() => undefined}
      />,
    )

    fireEvent.click(await screen.findByRole("link", { name: /Buy/ }))

    expect(track).toHaveBeenCalledWith(
      "outbound_click",
      expect.objectContaining({
        product_id: 42,
        thread_id: threadId,
      }),
    )
  })
})
