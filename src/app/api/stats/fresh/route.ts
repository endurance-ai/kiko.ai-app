// 히어로 신뢰 서브라인용 라이브 수치 — 최근 24시간 내 갱신(updated_at)된 상품 수.
// 10분 메모리 캐시로 DB 부하 방지. 실패 시 fresh:null — 프론트는 폴백 수치 유지.

import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

const CACHE_MS = 10 * 60 * 1000
let cache: { at: number; fresh: number } | null = null

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return Response.json({ fresh: cache.fresh })
  }
  try {
    // last_seen_at = 오늘자 크롤에서 존재가 확인된 상품 전체 (updated_at 은 변경분만이라 과소집계)
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM products WHERE last_seen_at > now() - interval '1 day' AND in_stock"
    )
    cache = { at: Date.now(), fresh: rows[0]?.n ?? 0 }
    return Response.json({ fresh: cache.fresh })
  } catch {
    return Response.json({ fresh: null }, { status: 200 })
  }
}
