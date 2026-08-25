// Copied verbatim from finder-mockup/finder.html's CAT_IMG / NAV / SUBATTR / COMMON / STYLES
// <script> data. This is the FINAL approved finder design's nav/label structure — do not
// "improve" or reshuffle it, only port.
//
// NOTE: NAV/STYLES both include a "공용" (unisex) list from the mockup. FinderSection only
// takes gender="여성"|"남성" (the (chat) hero only has a 여성/남성 segment), so "공용" is unused
// today — kept here verbatim for a future unisex surface.
//
// The mockup's static sample product array has been removed — FinderSection now fetches real
// products from GET /api/web-finder/products (src/app/api/web-finder/products/route.ts, pg 직쿼리
// — supabase 기반 /api/finder/products 는 웹랜딩 환경에 DB_URL 이 없어 대신 만든 전용 라우트).
// What remains below (CATEGORY/SUBCATEGORY mapping) bridges this file's Korean nav labels to the
// actual products.category/subcategory values in the DB. 주의: src/shared/enums/product-enums.ts
// 의 Category("Outer"/"Top"…)는 VLM/프롬프트용 별도 taxonomy 로, 실제 products 테이블 값
// (lowercase 복수형: tops/bottoms/outerwear/knitwear/bags/headwear/accessories/jewelry/eyewear…)
// 과 다르다 — 여기 매핑은 2026-08 DB 실측 distinct 값 기준.

/** products.category 실측 값 중 웹 파인더가 쓰는 것들 */
export type WebFinderCategory =
  | "tops"
  | "bottoms"
  | "dresses"
  | "outerwear"
  | "knitwear"
  | "shoes"
  | "bags"
  | "headwear"
  | "accessories"
  | "jewelry"
  | "eyewear"
  | "swimwear"
  | "underwear"

export const CAT_IMG: Record<string, string> = {
  상의: "https://kith.com/cdn/shop/files/Y10-T23N14-100-FRONT_a87334c1-0f9f-47a3-9b65-d6528954e5af.jpg?v=1776115386&width=600",
  하의: "https://etcseoul.com/web/product/small/202603/e54a5d0de843c97042a21e615f14425b.jpg",
  원피스: "https://moringaearth.com/web/product/medium/202407/b16a47c18d5d7a6c5afa35498bc88573.jpg",
  아우터: "https://cayl.co.kr/web/product/extra/big/202310/0f8d881982d93ee0be67f382d72a648f.jpg",
  니트: "https://cdn.shopify.com/s/files/1/0587/9588/4710/files/alice-cardigan-knit-cardigan-7157376.jpg?v=1753967537",
  슈즈: "https://store.unionlosangeles.com/cdn/shop/files/nike_nike_w_field_general_steampale_ivory_IF5850-005_3.png?width=800",
  가방: "https://colocynth.kr/web/product/medium/202606/68e61db95faf53a1b44dd0f3b926f8a3.jpg",
  주얼리: "https://cdn.shopify.com/s/files/1/0683/8135/files/AEYDE-ALAYA-SMALL-BRASS-PALLADIUM-1_67fd51a2-6266-4228-bce2-2d3b5ef60576.jpg",
  모자: "https://bmuettestore.com/web/product/medium/202511/0408d5507da1f44b17bfb826d3926434.jpg",
  액세서리: "https://cdn.shopify.com/s/files/1/0683/8135/files/AEYDE-BELA-CASHMERE-SAND-3_1577d36e-778b-436a-9614-d9d81cd1391b.jpg",
  아이웨어: "https://cdn.shopify.com/s/files/1/0883/3702/3240/files/33704182_64730267_2048_21e20afc-0590-4b1d-99a1-699ba68c9271.webp",
  수영복: "https://ecimg.cafe24img.com/pg273b28076069002/lyh130lyh/web/product/medium/20240507/5efbce9d1e905d05ac59f8c589a8c00c.jpg",
  언더웨어: "https://cdn.shopify.com/s/files/1/3028/8266/files/LaceBraInPoppyRed.jpg",
}

export type FinderGender = "여성" | "남성" | "공용"

interface NavEntry {
  cats: string[]
  sub: Record<string, string[]>
}

export const NAV: Record<FinderGender, NavEntry> = {
  // DB 실측 카테고리·서브카테고리(300개 이상) 그대로 — 임의 품목(반소매/긴소매, 미니/롱스커트
  // 분리 등) 폐기 (2026-08-25 사용자 확정: 윤영 체계 1:1)
  여성: {
    cats: ["전체", "상의", "하의", "원피스", "아우터", "니트", "슈즈", "가방", "주얼리", "모자", "액세서리", "아이웨어", "수영복", "언더웨어"],
    sub: {
      상의: ["티셔츠", "셔츠", "블라우스", "슬리브리스", "후디", "맨투맨", "크롭탑", "캐미솔", "보디수트"],
      하의: ["스커트", "데님", "팬츠", "슬랙스", "쇼츠", "와이드팬츠", "카고팬츠", "스웨트팬츠", "조거", "치노", "레깅스"],
      원피스: ["미니 원피스", "미디 원피스", "맥시 원피스", "점프수트"],
      아우터: ["재킷", "코트", "봄버", "패딩", "데님 재킷", "베스트", "블레이저", "플리스", "윈드브레이커", "레더 재킷", "파카", "울 재킷"],
      니트: ["스웨터", "가디건", "풀오버", "니트탑", "터틀넥"],
      슈즈: ["스니커즈", "부츠", "샌들", "플랫", "힐", "뮬", "로퍼", "슬라이드"],
      가방: ["토트", "크로스백", "숄더백", "클러치", "백팩", "미니백"],
      주얼리: ["목걸이", "반지", "귀걸이", "팔찌"],
      모자: ["캡", "햇", "비니"],
      액세서리: ["스카프", "벨트", "양말", "장갑", "타이"],
      아이웨어: ["선글라스"],
      수영복: ["비키니", "수영복"],
      언더웨어: ["브라", "브리프"],
    },
  },
  남성: {
    cats: ["전체", "상의", "하의", "아우터", "니트", "슈즈", "가방", "주얼리", "모자", "액세서리", "아이웨어"],
    sub: {
      상의: ["티셔츠", "셔츠", "슬리브리스", "후디", "맨투맨", "피케/카라", "헨리넥"],
      하의: ["데님", "팬츠", "슬랙스", "쇼츠", "와이드팬츠", "카고팬츠", "스웨트팬츠", "조거", "치노"],
      아우터: ["재킷", "코트", "봄버", "패딩", "데님 재킷", "베스트", "블레이저", "플리스", "윈드브레이커", "레더 재킷", "파카", "울 재킷"],
      니트: ["스웨터", "가디건", "풀오버", "니트탑", "터틀넥"],
      슈즈: ["스니커즈", "부츠", "로퍼", "샌들", "슬라이드"],
      가방: ["토트", "크로스백", "숄더백", "백팩"],
      주얼리: ["목걸이", "반지", "팔찌"],
      모자: ["캡", "햇", "비니"],
      액세서리: ["스카프", "벨트", "양말", "장갑", "타이"],
      아이웨어: ["선글라스"],
    },
  },
  공용: {
    cats: ["전체", "상의", "하의", "아우터", "니트", "슈즈", "가방", "모자", "액세서리"],
    sub: {
      상의: ["티셔츠", "셔츠", "후디", "맨투맨"],
      하의: ["데님", "팬츠", "슬랙스", "쇼츠"],
      아우터: ["재킷", "코트", "봄버", "패딩"],
      니트: ["스웨터", "가디건", "풀오버"],
      슈즈: ["스니커즈", "부츠", "로퍼"],
      가방: ["토트", "크로스백", "백팩"],
      모자: ["캡", "햇", "비니"],
      액세서리: ["스카프", "벨트", "양말"],
    },
  },
}

// ─── 품목별 속성 칩 (subsubrow) — VLM v2.6 실필터 ────────────────────────────
// product_features_v26.attr 의 실측 축/값(2026-08 distinct 쿼리) 기준. 품목당 한 축만:
// 기존 목업 축과 가장 가까운 것 선택 — 하의류=핏(leg_shape), 상의류=핏감(volume),
// 풀오버=넥라인(neckline), 스커트=실루엣(skirt_shape).
// 매핑 불가라 제거된 목업 라벨: 데님 라이즈 3종(라이즈 축 없음), 쇼츠 전체(미니/버뮤다/
// 데님쇼츠 — length 값과 정합 불명), 조거/부츠컷/테이퍼드(leg_shape 에 없거나 표본 15행),
// 크롭/슬림/시스루(volume 에 없음), 케이블(neckline 아님), H라인(skirt_shape 에 없음).
export interface SubAttrAxis {
  key: string // product_features_v26 attr 키 (라우트 화이트리스트와 일치해야 함)
  options: { label: string; value: string }[]
}

const LEG_SHAPE_FIT: SubAttrAxis = {
  key: "leg_shape",
  options: [
    { label: "스키니", value: "skinny" },
    { label: "스트레이트", value: "straight" },
    { label: "와이드", value: "wide" },
    { label: "플레어", value: "flare" },
  ],
}
const VOLUME_FIT: SubAttrAxis = {
  key: "volume",
  options: [
    { label: "슬림", value: "fitted" },
    { label: "레귤러", value: "regular" },
    { label: "릴렉스드", value: "relaxed" },
    { label: "오버사이즈", value: "oversized" },
  ],
}
const SKIRT_SHAPE: SubAttrAxis = {
  key: "skirt_shape",
  options: [
    { label: "A라인", value: "a_line" },
    { label: "펜슬", value: "pencil" },
    { label: "플리츠", value: "pleated" },
    { label: "랩", value: "wrap" },
    { label: "드레이프", value: "draped" },
  ],
}

export const SUBATTR: Record<string, SubAttrAxis> = {
  // 하의 팬츠류 = 핏(leg_shape)
  데님: LEG_SHAPE_FIT,
  팬츠: LEG_SHAPE_FIT,
  슬랙스: LEG_SHAPE_FIT,
  카고팬츠: LEG_SHAPE_FIT,
  스웨트팬츠: LEG_SHAPE_FIT,
  조거: LEG_SHAPE_FIT,
  치노: LEG_SHAPE_FIT,
  // 상의류 = 핏감(volume)
  티셔츠: VOLUME_FIT,
  셔츠: VOLUME_FIT,
  블라우스: VOLUME_FIT,
  슬리브리스: VOLUME_FIT,
  후디: VOLUME_FIT,
  맨투맨: VOLUME_FIT,
  크롭탑: VOLUME_FIT,
  "피케/카라": VOLUME_FIT,
  헨리넥: VOLUME_FIT,
  // 니트 = 핏감, 풀오버만 넥라인
  스웨터: VOLUME_FIT,
  가디건: VOLUME_FIT,
  니트탑: VOLUME_FIT,
  터틀넥: VOLUME_FIT,
  풀오버: {
    key: "neckline",
    options: [
      { label: "크루넥", value: "round" },
      { label: "브이넥", value: "v" },
      { label: "터틀넥", value: "turtleneck" },
    ],
  },
  // 스커트·원피스 = 실루엣(skirt_shape)
  스커트: SKIRT_SHAPE,
  "미니 원피스": SKIRT_SHAPE,
  "미디 원피스": SKIRT_SHAPE,
  "맥시 원피스": SKIRT_SHAPE,
  // 아우터 = 핏감
  재킷: VOLUME_FIT,
  코트: VOLUME_FIT,
  봄버: VOLUME_FIT,
  패딩: VOLUME_FIT,
  "데님 재킷": VOLUME_FIT,
  베스트: VOLUME_FIT,
  블레이저: VOLUME_FIT,
  플리스: VOLUME_FIT,
  윈드브레이커: VOLUME_FIT,
  "레더 재킷": VOLUME_FIT,
  파카: VOLUME_FIT,
  "울 재킷": VOLUME_FIT,
}

const COMMON = [
  "미니멀",
  "올드머니",
  "프레피",
  "고프코어",
  "러닝코어",
  "스트릿",
  "그런지",
  "Y2K",
  "다크웨어",
  "해체/아방가르드",
  "블록코어",
  "포엣코어",
]

// 2026-08-24 확정 신규 트렌드 태그 — 리스트 앞쪽 우선 노출 (가로 스크롤 행이라 개수 무관).
// 포엣코어는 COMMON 에도 있어 dedupe 로 앞자리만 남긴다.
const TREND_W = ["란제리코어", "코케트", "모리걸", "그래놀라코어", "슬래커코어", "포엣코어"]
const TREND_M = ["그래놀라코어", "슬래커코어", "포엣코어"]
const dedupe = (list: string[]) => Array.from(new Set(list))

export const STYLES: Record<FinderGender, string[]> = {
  여성: dedupe([...TREND_W, "프렌치시크", "코티지코어", "리조트", "핫걸", "애슬레저/요가", "나이트클러빙", "발레코어", ...COMMON]),
  남성: dedupe([...TREND_M, "시티보이", "아메카지", "워크웨어", ...COMMON]),
  공용: [...COMMON],
}

// ─── API bridge: Korean nav labels → GET /api/web-finder/products params ─────
//
// products.category/subcategory 실측 값(2026-08 distinct 쿼리) 기준 매핑. DB taxonomy 가
// 니트(knitwear)·모자(headwear)·주얼리(jewelry)를 독립 카테고리로 갖고 있어 nav 7종이 전부
// 카테고리 equality 로 떨어진다 — search fallback 불필요.
//
// Once a specific 품목 (subrow label) is picked, SUBCATEGORY_MAP below gives an exact
// {category, subcategory} pair and takes priority over the top-level category — 이 때문에
// 가디건(니트/아우터 양쪽 nav 에 등장)이 DB 상 실제 위치인 knitwear/cardigan 으로 풀린다.
//
// 남은 갭 (매핑 자체가 불가능한 라벨):
//
// 품목별 속성 (subsubrow, e.g. "오버핏"/"슬림") has no server-side equivalent at all — the API
// has no fit/rise filter param — so those chips stay decorative (see FinderSection.tsx).

export const NAV_CATEGORY_QUERY: Record<string, { category: WebFinderCategory }> = {
  상의: { category: "tops" },
  하의: { category: "bottoms" },
  원피스: { category: "dresses" },
  아우터: { category: "outerwear" },
  니트: { category: "knitwear" },
  슈즈: { category: "shoes" },
  가방: { category: "bags" },
  주얼리: { category: "jewelry" },
  모자: { category: "headwear" },
  액세서리: { category: "accessories" },
  아이웨어: { category: "eyewear" },
  수영복: { category: "swimwear" },
  언더웨어: { category: "underwear" },
}

export const SUBCATEGORY_MAP: Record<
  string,
  { category: WebFinderCategory; subcategory?: string }
> = {
  // 상의 (tops)
  티셔츠: { category: "tops", subcategory: "t-shirt" },
  셔츠: { category: "tops", subcategory: "shirt" },
  블라우스: { category: "tops", subcategory: "blouse" },
  슬리브리스: { category: "tops", subcategory: "tank-top" },
  후디: { category: "tops", subcategory: "hoodie" },
  맨투맨: { category: "tops", subcategory: "sweatshirt" },
  크롭탑: { category: "tops", subcategory: "crop-top" },
  캐미솔: { category: "tops", subcategory: "camisole" },
  보디수트: { category: "tops", subcategory: "bodysuit" },
  "피케/카라": { category: "tops", subcategory: "polo" },
  헨리넥: { category: "tops", subcategory: "henley" },
  // 하의 (bottoms)
  스커트: { category: "bottoms", subcategory: "skirt" },
  데님: { category: "bottoms", subcategory: "jeans" },
  팬츠: { category: "bottoms", subcategory: "pants" },
  슬랙스: { category: "bottoms", subcategory: "trousers" },
  쇼츠: { category: "bottoms", subcategory: "shorts" },
  와이드팬츠: { category: "bottoms", subcategory: "wide-pants" },
  카고팬츠: { category: "bottoms", subcategory: "cargo-pants" },
  스웨트팬츠: { category: "bottoms", subcategory: "sweatpants" },
  조거: { category: "bottoms", subcategory: "joggers" },
  치노: { category: "bottoms", subcategory: "chinos" },
  레깅스: { category: "bottoms", subcategory: "leggings" },
  // 원피스 (dresses)
  "미니 원피스": { category: "dresses", subcategory: "mini-dress" },
  "미디 원피스": { category: "dresses", subcategory: "midi-dress" },
  "맥시 원피스": { category: "dresses", subcategory: "maxi-dress" },
  점프수트: { category: "dresses", subcategory: "jumpsuit" },
  // 아우터 (outerwear)
  재킷: { category: "outerwear", subcategory: "jacket" },
  코트: { category: "outerwear", subcategory: "overcoat" },
  봄버: { category: "outerwear", subcategory: "bomber" },
  패딩: { category: "outerwear", subcategory: "down-jacket" },
  "데님 재킷": { category: "outerwear", subcategory: "denim-jacket" },
  베스트: { category: "outerwear", subcategory: "vest" },
  블레이저: { category: "outerwear", subcategory: "blazer" },
  플리스: { category: "outerwear", subcategory: "fleece" },
  윈드브레이커: { category: "outerwear", subcategory: "windbreaker" },
  "레더 재킷": { category: "outerwear", subcategory: "leather-jacket" },
  파카: { category: "outerwear", subcategory: "parka" },
  "울 재킷": { category: "outerwear", subcategory: "wool-jacket" },
  // 니트 (knitwear)
  스웨터: { category: "knitwear", subcategory: "sweater" },
  가디건: { category: "knitwear", subcategory: "cardigan" },
  풀오버: { category: "knitwear", subcategory: "pullover" },
  니트탑: { category: "knitwear", subcategory: "knit-top" },
  터틀넥: { category: "knitwear", subcategory: "turtleneck" },
  // 슈즈 (shoes)
  스니커즈: { category: "shoes", subcategory: "sneakers" },
  부츠: { category: "shoes", subcategory: "boots" },
  샌들: { category: "shoes", subcategory: "sandals" },
  플랫: { category: "shoes", subcategory: "flats" },
  힐: { category: "shoes", subcategory: "heels" },
  뮬: { category: "shoes", subcategory: "mules" },
  로퍼: { category: "shoes", subcategory: "loafers" },
  슬라이드: { category: "shoes", subcategory: "slides" },
  // 가방 (bags)
  토트: { category: "bags", subcategory: "tote" },
  크로스백: { category: "bags", subcategory: "crossbody" },
  숄더백: { category: "bags", subcategory: "shoulder-bag" },
  클러치: { category: "bags", subcategory: "clutch" },
  백팩: { category: "bags", subcategory: "backpack" },
  미니백: { category: "bags", subcategory: "mini-bag" },
  // 주얼리 (jewelry)
  목걸이: { category: "jewelry", subcategory: "necklace" },
  반지: { category: "jewelry", subcategory: "ring" },
  귀걸이: { category: "jewelry", subcategory: "earrings" },
  팔찌: { category: "jewelry", subcategory: "bracelet" },
  // 모자 (headwear)
  캡: { category: "headwear", subcategory: "cap" },
  햇: { category: "headwear", subcategory: "hat" },
  비니: { category: "headwear", subcategory: "beanie" },
  // 액세서리 (accessories)
  스카프: { category: "accessories", subcategory: "scarf" },
  벨트: { category: "accessories", subcategory: "belt" },
  양말: { category: "accessories", subcategory: "socks" },
  장갑: { category: "accessories", subcategory: "gloves" },
  타이: { category: "accessories", subcategory: "tie" },
  // 아이웨어 (eyewear)
  선글라스: { category: "eyewear", subcategory: "sunglasses" },
  // 수영복 (swimwear)
  비키니: { category: "swimwear", subcategory: "bikini" },
  수영복: { category: "swimwear", subcategory: "swimsuit" },
  // 언더웨어 (underwear)
  브라: { category: "underwear", subcategory: "bra" },
  브리프: { category: "underwear", subcategory: "briefs" },
}

/** curCat/curSub 선택 → category/subcategory 쿼리 파라미터 해석 (DB 실측 1:1) */
export function resolveNavQuery(
  curCat: string,
  curSub: string | null
): { category?: WebFinderCategory; subcategory?: string } {
  if (curSub) {
    const bySub = SUBCATEGORY_MAP[curSub]
    if (bySub) return { category: bySub.category, subcategory: bySub.subcategory }
  }
  if (curCat !== "전체") {
    const byCat = NAV_CATEGORY_QUERY[curCat]
    if (byCat) return { category: byCat.category }
  }
  return {}
}

/** FinderSection gender prop → API gender 파라미터 (유니섹스 포함, 큐레이션 규칙과 동일) */
export const GENDER_TO_API: Record<"여성" | "남성", string> = {
  여성: "women,unisex",
  남성: "men,unisex",
}

// 스타일 필 → 상품 레벨 gate_tags 태그명 (product_features_v26, 2026-08-25 실측 27종 — 정본).
// 라벨과 태그명이 다른 것만 리네임. 윤영 확인: gate_tags = 속성 게이트 최종값.
export const STYLE_GATE_TAGS: Record<string, string> = {
  미니멀: "미니멀룩",
  올드머니: "올드머니룩",
  프레피: "프레피룩",
  "해체/아방가르드": "해체주의",
  프렌치시크: "프렌치시크",
  코티지코어: "코티지코어",
  리조트: "리조트",
  핫걸: "핫걸",
  "애슬레저/요가": "애슬레저/요가",
  나이트클러빙: "나이트클러빙",
  발레코어: "발레코어",
  고프코어: "고프코어",
  러닝코어: "러닝코어",
  스트릿: "스트릿",
  그런지: "그런지",
  Y2K: "Y2K",
  다크웨어: "다크웨어",
  시티보이: "시티보이",
  아메카지: "아메카지",
  워크웨어: "워크웨어",
  블록코어: "블록코어",
  란제리코어: "란제리코어",
  코케트: "코케트",
  모리걸: "모리걸",
  그래놀라코어: "그래놀라코어",
  슬래커코어: "슬래커코어",
  포엣코어: "포엣코어",
}

// 브랜드 노드 폴백 (gate_tags 미존재 라벨용) — 현재 27종 전부 태그가 있어 실사용 없음
export const STYLE_NODE_CODES: Record<string, string[]> = {}

/** /api/web-finder/products 응답 상품 (camelCase) */
export interface FinderApiProduct {
  id: string
  brand: string
  name: string
  price: number | null
  salePrice: number | null
  originalPrice: number | null
  imageUrl: string | null
  productUrl: string | null
}

export interface FinderApiResponse {
  products?: FinderApiProduct[]
  total?: number
  page?: number
  totalPages?: number
  error?: string
}
