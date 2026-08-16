"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import Image from "next/image"
import Link from "next/link"
import {useRouter, useSearchParams} from "next/navigation"
import {AlertTriangle, Loader2, Plus, RefreshCw} from "lucide-react"
import {cn} from "@/lib/utils"
import type {CurationProduct, CurationSection, Gender} from "@/domains/admin-tools/curation/types"

const SECTION_SIZE = 30

export default function CurationAdminPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gender: Gender = searchParams.get("gender") === "men" ? "men" : "women"
  const [sections, setSections] = useState<CurationSection[]>([])
  const [previews, setPreviews] = useState<Map<number, CurationProduct>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/curation-sections?gender=${gender}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      const nextSections = data.sections as CurationSection[]
      setSections(nextSections)

      const ids = [...new Set(nextSections.flatMap((section) => section.product_ids.slice(0, 4)))]
      if (ids.length === 0) {
        setPreviews(new Map())
        return
      }
      const productResponse = await fetch(
        `/api/admin/curation-sections?view=products&gender=${gender}&ids=${ids.join(",")}`
      )
      const productData = await productResponse.json()
      if (!productResponse.ok) throw new Error(productData.error ?? `HTTP ${productResponse.status}`)
      setPreviews(
        new Map(
          (productData.products as CurationProduct[]).map((product) => [product.product_id, product])
        )
      )
    } catch (err) {
      setError((err as Error).message)
      setSections([])
      setPreviews(new Map())
    } finally {
      setLoading(false)
    }
  }, [gender])

  useEffect(() => {
    void load()
  }, [load])

  const thinCount = useMemo(
    () =>
      sections.filter(
        (section) =>
          section.is_active && section.slot_type === "editorial" && section.shown < SECTION_SIZE
      ).length,
    [sections]
  )

  const changeGender = (next: Gender) => router.replace(`/admin/curation?gender=${next}`)

  return (
    <div className="flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">큐레이션 구좌</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            구좌별 대표 상품과 실제 노출 수를 확인하고, 전용 화면에서 상품을 편집합니다.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            {(["women", "men"] as Gender[]).map((item) => (
              <button
                key={item}
                onClick={() => changeGender(item)}
                className={cn(
                  "px-3 py-2 text-sm",
                  gender === item ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {item === "women" ? "여성" : "남성"}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            새로고침
          </button>
          <Link
            href={`/admin/curation/new?gender=${gender}`}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm text-background"
          >
            <Plus className="size-4" />새 구좌
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-right">순서</th>
              <th className="px-3 py-2.5 text-left">구좌 ID</th>
              <th className="px-3 py-2.5 text-left">종류</th>
              <th className="px-3 py-2.5 text-left">디자인</th>
              <th className="px-3 py-2.5 text-left">제목</th>
              <th className="px-3 py-2.5 text-left">대표 상품</th>
              <th className="px-3 py-2.5 text-right">등록 / 사용</th>
              <th className="px-3 py-2.5 text-right">실제 노출</th>
              <th className="px-3 py-2.5 text-left">상태</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading && sections.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && sections.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-muted-foreground">
                  등록된 구좌가 없습니다.
                </td>
              </tr>
            )}
            {sections.map((section) => {
              const thin =
                section.is_active &&
                section.slot_type === "editorial" &&
                section.shown < SECTION_SIZE
              const visibleIds = section.product_ids
              return (
                <tr
                  key={`${section.section_id}:${section.gender}`}
                  className={cn("border-t", !section.is_active && "bg-muted/20 text-muted-foreground")}
                >
                  <td className="px-3 py-3 text-right tabular-nums">{section.sort_order}</td>
                  <td className="px-3 py-3 font-mono text-xs">{section.section_id}</td>
                  <td className="px-3 py-3">{section.slot_type}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        section.display_type === "trending" &&
                          "border-blue-500/60 bg-blue-500/5 text-blue-600"
                      )}
                    >
                      {section.display_type}
                    </span>
                  </td>
                  <td className="max-w-48 px-3 py-3">
                    <div className="truncate font-medium text-foreground">{section.title}</div>
                    {section.subtitle && <div className="truncate text-xs">{section.subtitle}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {section.slot_type === "auto" ? (
                      <span className="text-xs">자동 선정</span>
                    ) : (
                      <div className="flex -space-x-2">
                        {visibleIds.slice(0, 4).map((id) => {
                          const product = previews.get(id)
                          return (
                            <div
                              key={id}
                              title={product ? `${product.brand} ${product.name}` : `상품 ${id}`}
                              className="relative h-12 w-9 overflow-hidden rounded border bg-muted ring-2 ring-background"
                            >
                              {product?.image_url ? (
                                <Image
                                  src={product.image_url}
                                  alt=""
                                  fill
                                  sizes="36px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[9px]">{id}</span>
                              )}
                            </div>
                          )
                        })}
                        {visibleIds.length === 0 && <span className="text-xs">상품 없음</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {`${section.product_ids.length} / ${section.live_count}`}
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", thin && "font-semibold text-amber-600")}>
                    {section.shown}
                    {thin && " ⚠"}
                  </td>
                  <td className="px-3 py-3">
                    {section.is_active ? (
                      <span className="text-emerald-600">활성</span>
                    ) : (
                      <span>초안</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/curation/${section.gender}/${encodeURIComponent(section.section_id)}`}
                      className="rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                    >
                      편집
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        등록은 저장된 ID 수, 사용은 현재 노출 조건을 통과한 수입니다. 실제 노출은 앞 구좌의 중복 상품을 제외한 수입니다.
        {thinCount > 0 && ` 현재 ${thinCount}개 활성 구좌가 ${SECTION_SIZE}개 미만입니다.`}
      </p>
    </div>
  )
}
