"use client"

import {useState, useRef, type KeyboardEvent} from "react"
import Image from "next/image"
import {useRouter} from "next/navigation"
import {ArrowUpRight, ChevronLeft} from "lucide-react"
import {cn} from "@/lib/utils"
import {formatProductPrice} from "@/lib/format-product-price"

type Review = {
  id: string
  text: string | null
  author: string | null
  review_date: string | null
  photo_urls: string[] | null
  body_info: {
    height?: string
    weight?: string
    usualSize?: string
    purchasedSize?: string
    bodyType?: string
  } | null
  created_at: string
}

type ProductDetailProps = {
  product: {
    id: string
    brand: string
    name: string
    price: number | null
    original_price: number | null
    sale_price: number | null
    source_currency: string | null
    source_price: number | null
    image_url: string | null
    images: string[] | null
    product_url: string
    platform: string
    category: string | null
    subcategory: string | null
    gender: string[] | null
    in_stock: boolean
    description: string | null
    tags: string[] | null
    size_info: string | null
    review_count: number | null
    is_brand_representative: boolean | null
    crawled_at: string | null
    updated_at: string | null
  }
  primaryColor: string | null
  styleNode: {code: string; name_en: string} | null
  hasEmbedding: boolean
  embeddedAt: string | null
  reviews: Review[]
}

export function ProductDetail({product, primaryColor, styleNode, hasEmbedding, embeddedAt, reviews}: ProductDetailProps) {
  const router = useRouter()
  // 이미지 갤러리: image_url 우선 + images[] 합쳐서 dedupe
  const gallery: string[] = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    if (product.image_url) {
      seen.add(product.image_url)
      out.push(product.image_url)
    }
    for (const u of product.images ?? []) {
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(u)
    }
    return out
  })()
  const [activeImg, setActiveImg] = useState(0)
  const heroImg = gallery[activeImg] ?? product.image_url
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleThumbKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const next = e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(gallery.length - 1, i + 1)
    setActiveImg(next)
    thumbRefs.current[next]?.focus()
  }

  const formatPrice = (krwPrice: number | null) =>
    formatProductPrice({
      sourcePrice: product.source_price,
      sourceCurrency: product.source_currency,
      krwPrice,
    })

  // 할인율 계산 (sale_price 있고 original_price/price 가 더 클 때만)
  const baseForDiscount = product.original_price ?? product.price
  const discountPct =
    product.sale_price && baseForDiscount && baseForDiscount > product.sale_price
      ? Math.round((1 - product.sale_price / baseForDiscount) * 100)
      : null

  // 리뷰 카운트: DB review_count 우선 (limit 50 의 reviews.length 보다 정확)
  const reviewCount = product.review_count ?? reviews.length

  // 정보 그리드용 row 빌더
  const infoRows: Array<[string, string]> = []
  if (product.gender?.length) infoRows.push(["gender", product.gender.join(", ")])
  infoRows.push(["in_stock", String(product.in_stock)])
  if (product.category) infoRows.push(["category", product.category])
  if (product.subcategory) infoRows.push(["subcategory", product.subcategory])
  if (primaryColor) infoRows.push(["color", primaryColor])
  if (product.tags?.length) infoRows.push(["tags", product.tags.join(", ")])
  if (product.size_info) infoRows.push(["size_info", product.size_info])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Back link */}
      {/* 카드가 넘긴 ret(목록 필터)로 목록 복원 — 없으면 기본 목록 */}
      <button
        type="button"
        onClick={() => {
          const ret = new URLSearchParams(window.location.search).get("ret")
          router.push(ret ? `/admin/products?${ret}` : "/admin/products")
        }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        상품 목록
      </button>

      {/* Main layout — md(768px) 부터 2단 */}
      <div className="flex flex-col gap-6 md:flex-row">
        {/* ── Left: Image + thumbnail strip ───────────────── */}
        <div className="md:flex-1 md:sticky md:top-4 md:self-start md:max-w-[480px] space-y-2">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/20 md:aspect-[3/4]">
            {heroImg ? (
              <Image
                src={heroImg}
                alt={`${product.brand} ${product.name}`}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 480px, 100vw"
                unoptimized
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                이미지 없음
              </div>
            )}
            {!product.in_stock && (
              <div className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium text-muted-foreground backdrop-blur">
                품절
              </div>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="상품 이미지 갤러리">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  ref={(el) => {
                    thumbRefs.current[i] = el
                  }}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  onKeyDown={(e) => handleThumbKey(e, i)}
                  aria-label={`이미지 ${i + 1} / ${gallery.length}`}
                  aria-current={i === activeImg}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded border bg-muted/20 transition",
                    i === activeImg
                      ? "border-foreground ring-1 ring-foreground"
                      : "border-border hover:border-foreground/40",
                  )}
                >
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Info ─────────────────────────────────── */}
        <div className="flex-1 space-y-5">
          {/* Platform + 대표 배지 */}
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{product.platform}</span>
            {product.is_brand_representative && (
              <Badge tone="warning" title="브랜드 노드 대표 상품">
                ★ 대표
              </Badge>
            )}
          </div>

          {/* Brand & Name */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold leading-tight">{product.brand}</h1>
            <p className="text-base text-muted-foreground">{product.name}</p>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {formatPrice(product.sale_price ?? product.price)}
              </span>
              {product.sale_price && (
                <del className="text-sm font-normal text-muted-foreground tabular-nums">
                  {formatPrice(product.original_price ?? product.price)}
                </del>
              )}
              {discountPct != null && discountPct > 0 && (
                <Badge tone="warning">-{discountPct}%</Badge>
              )}
            </div>
            {product.source_currency && product.source_currency.toUpperCase() !== "KRW" && product.source_price != null && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                원가: {product.source_currency} {product.source_price}
              </p>
            )}
          </div>

          {/* v6 SIGNALS — 컴팩트 inline */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-turquoise/20 bg-turquoise/5 px-3 py-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-turquoise">v6</span>
            <Badge tone={hasEmbedding ? "info" : "warning"}>
              {hasEmbedding ? "embedded" : "no embedding"}
            </Badge>
            {embeddedAt && (
              <span className="text-muted-foreground">{new Date(embeddedAt).toLocaleString("ko-KR")}</span>
            )}
            {styleNode && (
              <span className="ml-auto text-turquoise">
                {styleNode.code} · {styleNode.name_en}
              </span>
            )}
          </div>

          {/* External link */}
          <a
            href={product.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm transition-colors hover:bg-muted/20"
          >
            원본 상품 페이지
            <ArrowUpRight className="size-4" />
          </a>

          {/* ── Section: 기본 정보 ────────────────────────── */}
          <Section title="기본 정보">
            {infoRows.length > 0 ? (
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                {infoRows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words text-foreground/90">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <EmptyState>정보 없음</EmptyState>
            )}
          </Section>

          {/* ── Section: 상세 설명 ────────────────────────── */}
          <Section title="상세 설명">
            {product.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {product.description}
              </p>
            ) : (
              <EmptyState>상세 설명 없음</EmptyState>
            )}
          </Section>

          {/* ── Section: 리뷰 ─────────────────────────────── */}
          <Section
            title="리뷰"
            badge={reviewCount > 0 ? String(reviewCount) : undefined}
          >
            {reviews.length > 0 ? (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <div key={review.id} className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{review.author || "익명"}</span>
                      {review.review_date && (
                        <span className="text-xs text-muted-foreground">{review.review_date}</span>
                      )}
                    </div>

                    {review.text && (
                      <p className="text-sm leading-relaxed text-muted-foreground">{review.text}</p>
                    )}

                    {review.body_info && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {review.body_info.height && <BodyChip>{review.body_info.height}</BodyChip>}
                        {review.body_info.weight && <BodyChip>{review.body_info.weight}</BodyChip>}
                        {review.body_info.usualSize && <BodyChip>평소 {review.body_info.usualSize}</BodyChip>}
                        {review.body_info.purchasedSize && (
                          <BodyChip>구매 {review.body_info.purchasedSize}</BodyChip>
                        )}
                        {review.body_info.bodyType && <BodyChip>{review.body_info.bodyType}</BodyChip>}
                      </div>
                    )}

                    {review.photo_urls && review.photo_urls.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {review.photo_urls.map((url, i) => (
                          <div
                            key={i}
                            className="relative size-16 overflow-hidden rounded border border-border"
                          >
                            <Image
                              src={url}
                              alt={`리뷰 사진 ${i + 1}`}
                              fill
                              sizes="64px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {reviewCount > reviews.length && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    + {reviewCount - reviews.length}개 더 (최근 50개 표시)
                  </p>
                )}
              </div>
            ) : (
              <EmptyState>리뷰 없음</EmptyState>
            )}
          </Section>

          {/* Crawl meta footer */}
          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-0.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <dt>product_id</dt>
            <dd className="font-mono text-foreground/70">{product.id}</dd>
            {product.crawled_at && (
              <>
                <dt>crawled_at</dt>
                <dd className={cn(isStale(product.crawled_at) && "text-amber-600 dark:text-amber-400")}>
                  {fmtDateTime(product.crawled_at)}
                  {isStale(product.crawled_at) && " ⚠️ stale"}
                </dd>
              </>
            )}
            {product.updated_at && product.updated_at !== product.crawled_at && (
              <>
                <dt>updated_at</dt>
                <dd>{fmtDateTime(product.updated_at)}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
 * 내부 UI primitive — 톤·간격 일관화 (F)
 * ───────────────────────────────────────────────────────── */

function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {badge && (
          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="rounded-lg border border-border bg-muted/10 p-4">{children}</div>
    </section>
  )
}

function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode
  tone?: "neutral" | "info" | "warning"
  title?: string
}) {
  const toneCls =
    tone === "info"
      ? "bg-turquoise/15 text-turquoise"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
        : "bg-muted/40 text-muted-foreground"
  return (
    <span
      title={title}
      className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight", toneCls)}
    >
      {children}
    </span>
  )
}

function BodyChip({children}: {children: React.ReactNode}) {
  return (
    <span className="rounded bg-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{children}</span>
  )
}

function EmptyState({children}: {children: React.ReactNode}) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

// 30 일 이상 미크롤은 stale 로 간주 (재고/가격 변동 가능성)
function isStale(iso: string): boolean {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t > 30 * 24 * 60 * 60 * 1000
}
