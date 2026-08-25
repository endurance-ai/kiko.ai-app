import {beforeEach, describe, expect, it, vi} from "vitest"
import {NextRequest} from "next/server"

const mocks = vi.hoisted(() => ({reorderSections: vi.fn()}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/admin-auth", () => ({requireApprovedAdmin: vi.fn(async () => ({approved: true}))}))
vi.mock("./ai-client", () => ({
  deleteSection: vi.fn(),
  isAiError: (value: unknown) =>
    typeof value === "object" && value !== null && (value as {ok?: boolean}).ok === false,
  listSections: vi.fn(),
  lookupProducts: vi.fn(),
  previewFeed: vi.fn(),
  reorderSections: mocks.reorderSections,
  saveSection: vi.fn(),
}))

import {PATCH} from "./sections.route"

describe("PATCH /api/admin/curation-sections", () => {
  beforeEach(() => {
    mocks.reorderSections.mockReset()
    mocks.reorderSections.mockResolvedValue({updated: 2})
  })

  it("forwards the complete ordered section id list", async () => {
    const request = new NextRequest("http://localhost/api/admin/curation-sections", {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({gender: "women", section_ids: ["second", "first"]}),
    })

    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({updated: 2})
    expect(mocks.reorderSections).toHaveBeenCalledWith("women", ["second", "first"])
  })

  it("rejects malformed section lists before calling ai-server", async () => {
    const request = new NextRequest("http://localhost/api/admin/curation-sections", {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({gender: "women", section_ids: ["valid", 123]}),
    })

    const response = await PATCH(request)

    expect(response.status).toBe(400)
    expect(mocks.reorderSections).not.toHaveBeenCalled()
  })
})
