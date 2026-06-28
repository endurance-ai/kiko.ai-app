import Link from "next/link"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {Plus, Search} from "lucide-react"

type Row = {
  id: number
  code: string
  name_en: string
  name_ko: string
  mood: string | null
  include_rule: string | null
  exclude_rule: string | null
  keywords_en: string[]
  keywords_ko: string[]
  is_active: boolean
  updated_at: string
}

type StatusFilter = "all" | "active" | "inactive"

function normalizeSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ""
  return value?.trim() ?? ""
}

function normalizeStatus(value: string | string[] | undefined): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === "inactive" || raw === "all" ? raw : "active"
}

function statusHref(status: StatusFilter, q: string): string {
  const params = new URLSearchParams()
  if (status !== "active") params.set("status", status)
  if (q) params.set("q", q)
  const query = params.toString()
  return query ? `/admin/style-nodes?${query}` : "/admin/style-nodes"
}

function matchesQuery(row: Row, query: string): boolean {
  if (!query) return true
  const haystack = [
    row.code,
    row.name_en,
    row.name_ko,
    row.mood,
    row.include_rule,
    row.exclude_rule,
    ...row.keywords_en,
    ...row.keywords_ko,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export default async function StyleNodesPage({
  searchParams,
}: {
  searchParams: Promise<{q?: string | string[]; status?: string | string[]}>
}) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        관리자 권한이 필요합니다.
      </div>
    )
  }

  const {data, error} = await supabase
    .from("style_nodes")
    .select(
      "id, code, name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko, is_active, updated_at",
    )
    .order("code")

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        오류: {error.message}
      </div>
    )
  }

  const sp = await searchParams
  const query = normalizeSearchValue(sp.q)
  const status = normalizeStatus(sp.status)
  const rows = (data ?? []) as Row[]
  const activeCount = rows.filter((r) => r.is_active).length
  const inactiveCount = rows.length - activeCount
  const visibleRows = rows.filter((r) => {
    if (status === "active" && !r.is_active) return false
    if (status === "inactive" && r.is_active) return false
    return matchesQuery(r, query)
  })
  const filterTabs: {label: string; value: StatusFilter; count: number}[] = [
    {label: "활성", value: "active", count: activeCount},
    {label: "전체", value: "all", count: rows.length},
    {label: "비활성", value: "inactive", count: inactiveCount},
  ]

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">스타일 노드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            전체 {rows.length}개 · 활성 {activeCount}개 · 비활성 {inactiveCount}개. 클릭해서 편집.
          </p>
        </div>
        <Link
          href="/admin/style-nodes/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90"
        >
          <Plus className="size-4" />
          새 노드
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterTabs.map((tab) => (
            <Link
              key={tab.value}
              href={statusHref(tab.value, query)}
              className={
                status === tab.value
                  ? "inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background"
                  : "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {tab.label}
              <span className="font-mono text-[11px] opacity-75">{tab.count}</span>
            </Link>
          ))}
        </div>
        <form action="/admin/style-nodes" className="flex min-w-0 items-center gap-2 md:w-80">
          {status !== "active" && <input type="hidden" name="status" value={status} />}
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={query}
              placeholder="code, name, mood, keyword"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            검색
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 w-16">code</th>
              <th className="text-left px-4 py-2.5">name (en / ko)</th>
              <th className="text-left px-4 py-2.5 hidden md:table-cell">rules</th>
              <th className="text-left px-4 py-2.5 hidden lg:table-cell">keywords</th>
              <th className="text-left px-4 py-2.5 w-20">상태</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const keywords = [...r.keywords_en.slice(0, 3), ...r.keywords_ko.slice(0, 3)]
              return (
              <tr
                key={r.code}
                className="border-t border-border hover:bg-muted/30"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/style-nodes/${r.code}`}
                    className="font-mono font-semibold underline-offset-2 hover:underline"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/style-nodes/${r.code}`}
                    className="block hover:text-foreground"
                  >
                    <div className="font-medium">{r.name_en}</div>
                    <div className="text-xs text-muted-foreground">{r.name_ko}</div>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell max-w-md">
                  <div className="truncate">{r.mood ?? "—"}</div>
                  <div className="mt-1 truncate text-xs">
                    포함 {r.include_rule ?? "—"}
                  </div>
                  <div className="truncate text-xs">
                    제외 {r.exclude_rule ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell max-w-[220px]">
                  <div className="truncate">
                    {keywords.length > 0 ? keywords.join(", ") : "—"}
                  </div>
                  <div className="mt-1 font-mono text-[11px]">
                    en {r.keywords_en.length} · ko {r.keywords_ko.length}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.is_active
                        ? "inline-flex items-center gap-1 text-emerald-500 text-xs"
                        : "inline-flex items-center gap-1 text-muted-foreground text-xs"
                    }
                  >
                    <span
                      className={
                        r.is_active
                          ? "size-1.5 rounded-full bg-emerald-500"
                          : "size-1.5 rounded-full bg-muted-foreground"
                      }
                    />
                    {r.is_active ? "활성" : "비활성"}
                  </span>
                  <div className="mt-1 hidden font-mono text-[11px] text-muted-foreground sm:block">
                    {new Date(r.updated_at).toLocaleDateString("ko-KR")}
                  </div>
                </td>
              </tr>
              )
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="border-t border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  조건에 맞는 스타일 노드가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
