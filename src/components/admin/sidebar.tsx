"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {
    Activity,
    Bug,
    ClipboardList,
    Database,
    FileText,
    Inbox,
    LayoutGrid,
    ListChecks,
    MousePointerClick,
    Palette,
    ShoppingBag,
    Sparkles
} from "lucide-react"
import {cn} from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  description: string
  icon: typeof Palette
}

type NavSection = {title: string; items: NavItem[]}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "데이터",
    items: [
      {href: "/admin/curation", label: "큐레이션 구좌", description: "앱 메인 구좌 편성", icon: LayoutGrid},
      {href: "/admin/style-nodes", label: "스타일 노드", description: "스타일 분류 체계 관리", icon: Palette},
      {href: "/admin/brand-nodes", label: "브랜드 노드", description: "브랜드 + 분류 + 대표상품", icon: Database},
      {href: "/admin/brand-clusters", label: "브랜드 클러스터", description: "이미지 임베딩 2D 지도", icon: Sparkles},
      {href: "/admin/products", label: "상품 DB", description: "크롤링 상품 & AI 분석", icon: ShoppingBag},
      {href: "/admin/crawl", label: "크롤 모니터", description: "플랫폼별 SKU·stale·임베딩 현황", icon: Activity},
    ],
  },
  {
    title: "검수 큐",
    items: [
      {href: "/admin/product-collection", label: "브랜드 크롤 상태", description: "brand_nodes 제품 수집 상태", icon: ClipboardList},
      {href: "/admin/brand-node-review", label: "브랜드 검수", description: "브랜드 자동 분류 검수", icon: Inbox},
      {href: "/admin/brand-proposals", label: "메타 검수", description: "AI 메타 추론 (vibe·palette·...) 검수", icon: ListChecks},
    ],
  },
  {
    title: "인사이트",
    items: [
      {href: "/admin/ai-insights", label: "봇 추천 성과", description: "봇 검색 추천 CTR & latency", icon: MousePointerClick},
    ],
  },
  {
    title: "시스템",
    items: [
      {href: "/admin/prompts", label: "프롬프트", description: "Vision·검색 프롬프트 관리", icon: FileText},
      {href: "/admin/search-debugger", label: "검색 디버거", description: "검색 점수 분석", icon: Bug},
    ],
  },
]

const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-col border-r border-border bg-sidebar p-4 gap-1">
        <Link
          href="/admin"
          className="text-base font-bold tracking-tight text-sidebar-foreground mb-6 px-2"
        >
          kiko.ai{" "}
          <span className="text-muted-foreground font-normal text-sm">Admin</span>
        </Link>

        {NAV_SECTIONS.map((section, si) => (
          <div key={section.title} className={cn("flex flex-col gap-0.5", si > 0 && "mt-4")}>
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              {section.title}
            </div>
            {section.items.map(({href, label, description, icon: Icon}) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                  pathname.startsWith(href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <div>
                  <span className="text-sm leading-none">{label}</span>
                  <span className="block text-[11px] text-muted-foreground/70 mt-0.5 leading-none">
                    {description}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
              pathname.startsWith(href)
                ? "text-sidebar-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
