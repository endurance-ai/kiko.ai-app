"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import Image from "next/image"
import {AlertTriangle, Loader2, Plus, RefreshCw, Save, Trash2, X} from "lucide-react"
import {cn} from "@/lib/utils"

// 메인 큐레이션 구좌 관리. 데이터와 검증은 ai-server `/admin/curation/*` 이
// 소유하고 여기서는 /api/admin/curation-sections 프록시를 통해 읽고 쓴다.

type Gender = "women" | "men"
type SlotType = "auto" | "editorial"
type DisplayType = "default" | "trending"

type Section = {
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
  /** 앞 구좌가 먼저 가져간 상품을 뺀 실제 노출 수. */
  shown: number
}

type Product = {
  product_id: number
  brand: string
  name: string
  price: number | null
  image_url: string
  in_stock: boolean
  eligible: boolean
}

const AUTO_SECTION_IDS = ["popular", "trending-search", "under-100"]
const SECTION_SIZE = 12

const EMPTY: Section = {
  section_id: "",
  gender: "women",
  slot_type: "editorial",
  display_type: "default",
  title: "",
  subtitle: null,
  sort_order: 100,
  is_active: false,
  product_ids: [],
  live_count: 0,
  shown: 0,
}

function parseIds(text: string): number[] {
  return [...new Set((text.match(/\d+/g) ?? []).map(Number))]
}

export default function CurationAdminPage() {
  const [gender, setGender] = useState<Gender>("women")
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<Section | null>(null)
  const [idsText, setIdsText] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [missing, setMissing] = useState<number[]>([])
  const [busy, setBusy] = useState<"save" | "check" | "delete" | null>(null)
  const [editorMsg, setEditorMsg] = useState<string | null>(null)

  const load = useCallback(async (g: Gender) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/curation-sections?gender=${g}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSections(data.sections)
    } catch (err) {
      setError((err as Error).message)
      setSections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(gender)
  }, [gender, load])

  const openEditor = (section: Section | null) => {
    const next = section ?? {...EMPTY, gender}
    setDraft(next)
    setIdsText(next.product_ids.join(", "))
    setProducts([])
    setMissing([])
    setEditorMsg(null)
  }

  const isAuto = draft?.slot_type === "auto"

  const checkProducts = async () => {
    if (!draft) return
    const ids = parseIds(idsText)
    if (ids.length === 0) {
      setEditorMsg("상품 ID가 없습니다.")
      return
    }
    setBusy("check")
    try {
      const res = await fetch(
        `/api/admin/curation-sections?view=products&gender=${draft.gender}&ids=${ids.join(",")}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setProducts(data.products)
      setMissing(data.missing)
      const bad = data.products.filter((p: Product) => !p.eligible).length
      const parts = [`${data.products.length}개 조회`]
      if (bad > 0) parts.push(`${bad}개 노출 불가`)
      if (data.missing.length > 0) parts.push(`없는 ID ${data.missing.length}개`)
      setEditorMsg(parts.join(" · "))
    } catch (err) {
      setEditorMsg(`실패: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!draft) return
    setBusy("save")
    try {
      const res = await fetch("/api/admin/curation-sections", {
        method: "PUT",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          section_id: draft.section_id.trim(),
          gender: draft.gender,
          slot_type: draft.slot_type,
          display_type: draft.display_type,
          title: draft.title.trim(),
          subtitle: draft.subtitle?.trim() || null,
          sort_order: draft.sort_order,
          is_active: draft.is_active,
          product_ids: parseIds(idsText),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setEditorMsg(`저장됨 · 노출 가능 ${data.live_count}개`)
      await load(gender)
    } catch (err) {
      setEditorMsg(`실패: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!draft) return
    if (
      !window.confirm(
        `${draft.section_id} / ${draft.gender} 행을 삭제합니다. 되돌릴 수 없습니다.\n` +
          `숨기기만 하려면 "앱에 노출"을 끄고 저장하세요.`
      )
    ) {
      return
    }
    setBusy("delete")
    try {
      const res = await fetch(
        `/api/admin/curation-sections?section_id=${encodeURIComponent(draft.section_id)}&gender=${draft.gender}`,
        {method: "DELETE"}
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setDraft(null)
      await load(gender)
    } catch (err) {
      setEditorMsg(`실패: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const thinCount = useMemo(
    () =>
      sections.filter((s) => s.is_active && s.slot_type === "editorial" && s.shown < SECTION_SIZE)
        .length,
    [sections]
  )

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">큐레이션 구좌</h1>
          <p className="text-sm text-muted-foreground">
            저장하면 곧바로 앱 메인에 반영됩니다. auto 구좌의 상품은 매일 자동 계산되어 편집할 수
            없습니다.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            {(["women", "men"] as Gender[]).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={cn(
                  "px-3 py-1.5 text-sm",
                  gender === g ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {g === "women" ? "여성" : "남성"}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load(gender)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            새로고침
          </button>
          <button
            onClick={() => openEditor(null)}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
          >
            <Plus className="size-3.5" />새 구좌
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">순서</th>
              <th className="px-3 py-2 text-left">구좌 ID</th>
              <th className="px-3 py-2 text-left">종류</th>
              <th className="px-3 py-2 text-left">디자인</th>
              <th className="px-3 py-2 text-left">제목</th>
              <th className="px-3 py-2 text-right">등록</th>
              <th className="px-3 py-2 text-right">노출</th>
              <th className="px-3 py-2 text-left">활성</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  구좌가 없습니다.
                </td>
              </tr>
            )}
            {sections.map((s) => {
              const thin = s.is_active && s.slot_type === "editorial" && s.shown < SECTION_SIZE
              return (
                <tr
                  key={`${s.section_id}:${s.gender}`}
                  className={cn("border-t", !s.is_active && "opacity-50")}
                >
                  <td className="px-3 py-2 text-right tabular-nums">{s.sort_order}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.section_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.slot_type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        s.display_type === "trending" && "border-blue-500 text-blue-500"
                      )}
                    >
                      {s.display_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {s.product_ids.length}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      thin && "font-medium text-amber-600"
                    )}
                  >
                    {s.shown}
                    {thin && " ⚠"}
                  </td>
                  <td className="px-3 py-2">
                    {s.is_active ? (
                      <span className="text-emerald-600">on</span>
                    ) : (
                      <span className="text-muted-foreground">off</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => openEditor(s)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      편집
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        노출 = 앞 구좌와 겹치는 상품을 뺀 실제 카드 수입니다. 등록보다 적으면 앞 구좌가 먼저 가져간
        것입니다.
        {thinCount > 0 && ` 지금 ${thinCount}개 구좌가 ${SECTION_SIZE}개 미만입니다.`}
      </p>

      {draft && (
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <strong className="text-sm">
              {draft.section_id ? `편집 · ${draft.section_id} / ${draft.gender}` : "새 구좌"}
            </strong>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto rounded-md border p-1.5 hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="구좌 ID (소문자·숫자·하이픈)">
              <input
                value={draft.section_id}
                onChange={(e) => setDraft({...draft, section_id: e.target.value})}
                placeholder="editorial-summer-vacation"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="성별">
              <select
                value={draft.gender}
                onChange={(e) => setDraft({...draft, gender: e.target.value as Gender})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="women">여성</option>
                <option value="men">남성</option>
              </select>
            </Field>
            <Field label="종류">
              <select
                value={draft.slot_type}
                onChange={(e) => setDraft({...draft, slot_type: e.target.value as SlotType})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="editorial">editorial (직접 고름)</option>
                <option value="auto">auto (자동 계산)</option>
              </select>
            </Field>
            <Field label="디자인">
              <select
                value={draft.display_type}
                onChange={(e) => setDraft({...draft, display_type: e.target.value as DisplayType})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="default">default (기본 그리드)</option>
                <option value="trending">trending (트렌딩 전용)</option>
              </select>
            </Field>
            <Field label="제목">
              <input
                value={draft.title}
                onChange={(e) => setDraft({...draft, title: e.target.value})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="서브타이틀">
              <input
                value={draft.subtitle ?? ""}
                onChange={(e) => setDraft({...draft, subtitle: e.target.value})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="순서 (작을수록 위)">
              <input
                type="number"
                min={0}
                max={9999}
                value={draft.sort_order}
                onChange={(e) => setDraft({...draft, sort_order: Number(e.target.value)})}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="활성">
              <label className="flex items-center gap-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({...draft, is_active: e.target.checked})}
                />
                앱에 노출
              </label>
            </Field>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              상품 ID (쉼표/공백/줄바꿈 구분, 앞 20개가 노출됨)
            </label>
            <textarea
              value={idsText}
              onChange={(e) => setIdsText(e.target.value)}
              disabled={isAuto}
              rows={3}
              placeholder="713929, 673348, 672995 …"
              className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-50"
            />
            {isAuto && (
              <p className="mt-1 text-xs text-amber-600">
                auto 구좌입니다 — 상품 목록은 저장해도 반영되지 않습니다 (매일 자동 계산).
                {!AUTO_SECTION_IDS.includes(draft.section_id.trim()) &&
                  ` auto 는 ${AUTO_SECTION_IDS.join(" / ")} 만 가능합니다.`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void checkProducts()}
              disabled={busy !== null || isAuto}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {busy === "check" && <Loader2 className="size-3.5 animate-spin" />}
              상품 확인
            </button>
            <button
              onClick={() => void save()}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
            >
              {busy === "save" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              저장
            </button>
            <button
              onClick={() => void remove()}
              disabled={busy !== null || !draft.section_id}
              className="flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              삭제
            </button>
            {editorMsg && <span className="text-sm text-muted-foreground">{editorMsg}</span>}
          </div>

          {missing.length > 0 && (
            <p className="text-xs text-destructive">
              존재하지 않는 상품 ID: {missing.join(", ")}
            </p>
          )}

          {products.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {products.map((p) => (
                <div key={p.product_id} className="w-[88px] text-[11px] text-muted-foreground">
                  <div
                    className={cn(
                      "relative h-[117px] w-[88px] overflow-hidden rounded-md border",
                      !p.eligible && "ring-2 ring-destructive"
                    )}
                  >
                    {p.image_url && (
                      <Image
                        src={p.image_url}
                        alt=""
                        fill
                        sizes="88px"
                        className="object-cover"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="truncate font-mono">{p.product_id}</div>
                  <div className="truncate">{p.brand}</div>
                  {!p.eligible && <div className="text-destructive">노출 불가</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
