/**
 * 한국어 패션 용어 → enum 매핑 테이블
 *
 * 한국 유저들이 자주 사용하는 패션 용어를 시스템 enum으로 변환.
 * 검색엔진 name fallback + 프롬프트 분석 양쪽에서 사용.
 *
 * 카테고리: subcategory, pattern, fit, fabric, colorFamily, season
 */

// ─── 한국어 → subcategory 매핑 ─────────────────────────

export type KoreanVocabEntry = {
  subcategory: string
  category: string
  keywords: string[]  // 검색 키워드 (KO + EN)
}

/** 한국어 패션 용어 → enum subcategory + 검색 키워드 */
export const KOREAN_VOCAB: Record<string, KoreanVocabEntry> = {
  // ─── Outer ───
  "블루종": { subcategory: "bomber", category: "Outer", keywords: ["블루종", "blouson", "봄버"] },
  "야상": { subcategory: "field-jacket", category: "Outer", keywords: ["야상", "밀리터리", "field jacket"] },
  "항공점퍼": { subcategory: "bomber", category: "Outer", keywords: ["항공점퍼", "항공자켓", "bomber"] },
  "항공자켓": { subcategory: "bomber", category: "Outer", keywords: ["항공자켓", "항공점퍼", "bomber"] },
  "점퍼": { subcategory: "bomber", category: "Outer", keywords: ["점퍼", "자켓", "jumper"] },
  "패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["패딩", "다운", "puffer", "padding"] },
  "롱패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["롱패딩", "다운코트", "long puffer"] },
  "숏패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["숏패딩", "경량패딩", "short puffer"] },
  "경량패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["경량패딩", "라이트다운", "light down"] },
  "무스탕": { subcategory: "shearling", category: "Outer", keywords: ["무스탕", "양털", "shearling"] },
  "바람막이": { subcategory: "windbreaker", category: "Outer", keywords: ["바람막이", "윈드브레이커", "windbreaker"] },
  "윈드브레이커": { subcategory: "windbreaker", category: "Outer", keywords: ["윈드브레이커", "바람막이", "windbreaker"] },
  "사파리": { subcategory: "field-jacket", category: "Outer", keywords: ["사파리", "사파리자켓", "safari"] },
  "가디건": { subcategory: "cardigan", category: "Outer", keywords: ["가디건", "cardigan"] },
  "니트가디건": { subcategory: "cardigan", category: "Outer", keywords: ["니트가디건", "knit cardigan"] },
  "후리스": { subcategory: "fleece", category: "Outer", keywords: ["후리스", "플리스", "fleece"] },
  "플리스": { subcategory: "fleece", category: "Outer", keywords: ["플리스", "후리스", "fleece"] },
  "기모": { subcategory: "fleece", category: "Outer", keywords: ["기모", "플리스", "fleece"] },
  "코트": { subcategory: "overcoat", category: "Outer", keywords: ["코트", "coat"] },
  "롱코트": { subcategory: "overcoat", category: "Outer", keywords: ["롱코트", "오버코트", "long coat"] },
  "숏코트": { subcategory: "overcoat", category: "Outer", keywords: ["숏코트", "하프코트", "short coat"] },
  "트렌치": { subcategory: "trench-coat", category: "Outer", keywords: ["트렌치", "트렌치코트", "trench"] },
  "트렌치코트": { subcategory: "trench-coat", category: "Outer", keywords: ["트렌치코트", "트렌치", "trench coat"] },
  "자켓": { subcategory: "blazer", category: "Outer", keywords: ["자켓", "재킷", "jacket"] },
  "재킷": { subcategory: "blazer", category: "Outer", keywords: ["재킷", "자켓", "jacket"] },
  "블레이저": { subcategory: "blazer", category: "Outer", keywords: ["블레이저", "blazer"] },
  "정장자켓": { subcategory: "blazer", category: "Outer", keywords: ["정장자켓", "수트자켓", "suit jacket"] },
  "가죽자켓": { subcategory: "leather-jacket", category: "Outer", keywords: ["가죽자켓", "가죽재킷", "레더자켓", "leather jacket"] },
  "레더자켓": { subcategory: "leather-jacket", category: "Outer", keywords: ["레더자켓", "가죽자켓", "leather jacket"] },
  "라이더": { subcategory: "leather-jacket", category: "Outer", keywords: ["라이더", "라이더자켓", "바이커", "rider", "biker"] },
  "라이더자켓": { subcategory: "leather-jacket", category: "Outer", keywords: ["라이더자켓", "라이더", "rider jacket"] },
  "드리즐러": { subcategory: "leather-jacket", category: "Outer", keywords: ["드리즐러", "드리즐러재킷", "drizzler"] },
  "모터사이클": { subcategory: "leather-jacket", category: "Outer", keywords: ["모터사이클", "모터사이클자켓", "motorcycle"] },
  "램스킨": { subcategory: "leather-jacket", category: "Outer", keywords: ["램스킨", "양가죽", "lambskin"] },
  "데님자켓": { subcategory: "denim-jacket", category: "Outer", keywords: ["데님자켓", "청자켓", "denim jacket"] },
  "청자켓": { subcategory: "denim-jacket", category: "Outer", keywords: ["청자켓", "데님자켓", "denim jacket"] },
  "트러커자켓": { subcategory: "denim-jacket", category: "Outer", keywords: ["트러커자켓", "트러커", "trucker jacket"] },
  "조끼": { subcategory: "vest", category: "Outer", keywords: ["조끼", "베스트", "vest"] },
  "베스트": { subcategory: "vest", category: "Outer", keywords: ["베스트", "조끼", "vest"] },
  "패딩조끼": { subcategory: "vest", category: "Outer", keywords: ["패딩조끼", "패딩베스트", "puffer vest"] },
  "니트조끼": { subcategory: "vest", category: "Outer", keywords: ["니트조끼", "니트베스트", "sweater vest"] },
  "파카": { subcategory: "parka", category: "Outer", keywords: ["파카", "파르카", "parka"] },
  "아노락": { subcategory: "anorak", category: "Outer", keywords: ["아노락", "anorak"] },
  "잠바": { subcategory: "bomber", category: "Outer", keywords: ["잠바", "점바", "자켓", "jumper"] },
  "점바": { subcategory: "bomber", category: "Outer", keywords: ["점바", "잠바", "jumper"] },
  "더플코트": { subcategory: "overcoat", category: "Outer", keywords: ["더플코트", "duffle coat"] },
  "피코트": { subcategory: "overcoat", category: "Outer", keywords: ["피코트", "pea coat"] },
  "체스터코트": { subcategory: "overcoat", category: "Outer", keywords: ["체스터코트", "체스터필드", "chesterfield"] },
  "나일론자켓": { subcategory: "windbreaker", category: "Outer", keywords: ["나일론자켓", "nylon jacket"] },
  "싱글자켓": { subcategory: "blazer", category: "Outer", keywords: ["싱글자켓", "single breasted jacket"] },
  "더블자켓": { subcategory: "blazer", category: "Outer", keywords: ["더블자켓", "double breasted jacket"] },
  "MA-1": { subcategory: "bomber", category: "Outer", keywords: ["MA-1", "ma1", "봄버", "bomber"] },
  "후드집업": { subcategory: "hoodie", category: "Outer", keywords: ["후드집업", "집업후디", "zip hoodie"] },
  "집업": { subcategory: "hoodie", category: "Outer", keywords: ["집업", "지퍼", "zip-up"] },
  "후드티": { subcategory: "hoodie", category: "Outer", keywords: ["후드티", "후디", "hoodie"] },
  "후드": { subcategory: "hoodie", category: "Outer", keywords: ["후드", "후디", "후드티", "hoodie"] },
  "후디": { subcategory: "hoodie", category: "Outer", keywords: ["후디", "후드", "hoodie"] },
  "워크자켓": { subcategory: "chore-jacket", category: "Outer", keywords: ["워크자켓", "쵸어", "chore jacket"] },
  "쵸어자켓": { subcategory: "chore-jacket", category: "Outer", keywords: ["쵸어자켓", "워크자켓", "chore jacket"] },
  "오버셔츠": { subcategory: "overshirt", category: "Outer", keywords: ["오버셔츠", "셔츠자켓", "overshirt"] },
  "셔츠자켓": { subcategory: "overshirt", category: "Outer", keywords: ["셔츠자켓", "오버셔츠", "shirt jacket"] },
  "코치자켓": { subcategory: "windbreaker", category: "Outer", keywords: ["코치자켓", "coach jacket"] },
  "스타디움자켓": { subcategory: "bomber", category: "Outer", keywords: ["스타디움자켓", "스타쟌", "stadium jacket", "varsity"] },
  "스타쟌": { subcategory: "bomber", category: "Outer", keywords: ["스타쟌", "스타디움자켓", "varsity jacket"] },
  "바시티": { subcategory: "bomber", category: "Outer", keywords: ["바시티", "바시티자켓", "varsity"] },
  "케이프": { subcategory: "cape", category: "Outer", keywords: ["케이프", "cape"] },
  "판초": { subcategory: "poncho", category: "Outer", keywords: ["판초", "poncho"] },

  // ─── Top ───
  "맨투맨": { subcategory: "sweatshirt", category: "Top", keywords: ["맨투맨", "스웻셔츠", "sweatshirt", "mtm"] },
  "스웻셔츠": { subcategory: "sweatshirt", category: "Top", keywords: ["스웻셔츠", "맨투맨", "sweatshirt"] },
  "목폴라": { subcategory: "turtleneck", category: "Top", keywords: ["목폴라", "터틀넥", "폴라", "turtleneck"] },
  "폴라": { subcategory: "turtleneck", category: "Top", keywords: ["폴라", "터틀넥", "목폴라", "turtleneck"] },
  "터틀넥": { subcategory: "turtleneck", category: "Top", keywords: ["터틀넥", "폴라", "turtleneck"] },
  "반목": { subcategory: "turtleneck", category: "Top", keywords: ["반목", "반폴라", "mock neck"] },
  "반목폴라": { subcategory: "turtleneck", category: "Top", keywords: ["반목폴라", "반목", "mock neck"] },
  "반팔": { subcategory: "t-shirt", category: "Top", keywords: ["반팔", "반팔티", "t-shirt", "tee"] },
  "반팔티": { subcategory: "t-shirt", category: "Top", keywords: ["반팔티", "반팔", "t-shirt"] },
  "티셔츠": { subcategory: "t-shirt", category: "Top", keywords: ["티셔츠", "tee", "t-shirt"] },
  "긴팔": { subcategory: "t-shirt", category: "Top", keywords: ["긴팔", "긴팔티", "long sleeve"] },
  "긴팔티": { subcategory: "t-shirt", category: "Top", keywords: ["긴팔티", "긴팔", "long sleeve tee"] },
  "나시": { subcategory: "tank-top", category: "Top", keywords: ["나시", "민소매", "나시티", "sleeveless"] },
  "민소매": { subcategory: "tank-top", category: "Top", keywords: ["민소매", "나시", "sleeveless"] },
  "슬리브리스": { subcategory: "tank-top", category: "Top", keywords: ["슬리브리스", "민소매", "나시", "sleeveless"] },
  "나시티": { subcategory: "tank-top", category: "Top", keywords: ["나시티", "나시", "tank top"] },
  "탱크탑": { subcategory: "tank-top", category: "Top", keywords: ["탱크탑", "나시", "tank top"] },
  "니트": { subcategory: "sweater", category: "Top", keywords: ["니트", "knit", "sweater"] },
  "스웨터": { subcategory: "sweater", category: "Top", keywords: ["스웨터", "니트", "sweater"] },
  "니트탑": { subcategory: "knit-top", category: "Top", keywords: ["니트탑", "knit top"] },
  "러그비": { subcategory: "rugby-shirt", category: "Top", keywords: ["러그비", "럭비", "rugby"] },
  "럭비티": { subcategory: "rugby-shirt", category: "Top", keywords: ["럭비티", "러그비", "rugby shirt"] },
  "카라티": { subcategory: "polo", category: "Top", keywords: ["카라티", "폴로", "collar", "polo"] },
  "폴로": { subcategory: "polo", category: "Top", keywords: ["폴로", "폴로티", "카라티", "polo"] },
  "폴로셔츠": { subcategory: "polo", category: "Top", keywords: ["폴로셔츠", "폴로", "polo shirt"] },
  "헨리넥": { subcategory: "henley", category: "Top", keywords: ["헨리넥", "henley"] },
  "블라우스": { subcategory: "blouse", category: "Top", keywords: ["블라우스", "blouse"] },
  "셔츠": { subcategory: "shirt", category: "Top", keywords: ["셔츠", "남방", "shirt"] },
  "남방": { subcategory: "shirt", category: "Top", keywords: ["남방", "셔츠", "shirt"] },
  "와이셔츠": { subcategory: "shirt", category: "Top", keywords: ["와이셔츠", "드레스셔츠", "dress shirt"] },
  "린넨셔츠": { subcategory: "shirt", category: "Top", keywords: ["린넨셔츠", "리넨셔츠", "linen shirt"] },
  "옥스포드셔츠": { subcategory: "shirt", category: "Top", keywords: ["옥스포드셔츠", "옥스포드", "oxford shirt"] },
  "체크셔츠": { subcategory: "shirt", category: "Top", keywords: ["체크셔츠", "체크남방", "check shirt"] },
  "스트라이프셔츠": { subcategory: "shirt", category: "Top", keywords: ["스트라이프셔츠", "줄무늬셔츠", "stripe shirt"] },
  "캐미솔": { subcategory: "camisole", category: "Top", keywords: ["캐미솔", "캐미", "camisole"] },
  "크롭탑": { subcategory: "crop-top", category: "Top", keywords: ["크롭탑", "크롭", "crop top"] },
  "크롭": { subcategory: "crop-top", category: "Top", keywords: ["크롭", "크롭탑", "crop"] },
  "브이넥": { subcategory: "sweater", category: "Top", keywords: ["브이넥", "v넥", "v-neck"] },
  "라운드넥": { subcategory: "t-shirt", category: "Top", keywords: ["라운드넥", "크루넥", "crew neck"] },
  "크루넥": { subcategory: "sweatshirt", category: "Top", keywords: ["크루넥", "라운드넥", "crew neck"] },

  // ─── Bottom ───
  "청바지": { subcategory: "jeans", category: "Bottom", keywords: ["청바지", "진", "데님팬츠", "jeans"] },
  "진": { subcategory: "jeans", category: "Bottom", keywords: ["진", "청바지", "jeans"] },
  "데님": { subcategory: "jeans", category: "Bottom", keywords: ["데님", "청바지", "denim"] },
  "데님팬츠": { subcategory: "jeans", category: "Bottom", keywords: ["데님팬츠", "청바지", "denim pants"] },
  "일자바지": { subcategory: "trousers", category: "Bottom", keywords: ["일자바지", "스트레이트", "straight pants"] },
  "스트레이트진": { subcategory: "jeans", category: "Bottom", keywords: ["스트레이트진", "일자진", "straight jeans"] },
  "와이드팬츠": { subcategory: "wide-pants", category: "Bottom", keywords: ["와이드팬츠", "와이드", "wide pants"] },
  "와이드진": { subcategory: "wide-pants", category: "Bottom", keywords: ["와이드진", "와이드데님", "wide jeans"] },
  "와이드": { subcategory: "wide-pants", category: "Bottom", keywords: ["와이드", "와이드팬츠", "wide"] },
  "슬랙스": { subcategory: "trousers", category: "Bottom", keywords: ["슬랙스", "정장바지", "slacks", "trousers"] },
  "정장바지": { subcategory: "trousers", category: "Bottom", keywords: ["정장바지", "슬랙스", "dress pants"] },
  "면바지": { subcategory: "chinos", category: "Bottom", keywords: ["면바지", "치노", "chinos"] },
  "치노": { subcategory: "chinos", category: "Bottom", keywords: ["치노", "치노팬츠", "chinos"] },
  "반바지": { subcategory: "shorts", category: "Bottom", keywords: ["반바지", "숏팬츠", "shorts"] },
  "숏팬츠": { subcategory: "shorts", category: "Bottom", keywords: ["숏팬츠", "반바지", "shorts"] },
  "숏츠": { subcategory: "shorts", category: "Bottom", keywords: ["숏츠", "반바지", "shorts"] },
  "버뮤다": { subcategory: "shorts", category: "Bottom", keywords: ["버뮤다", "버뮤다팬츠", "bermuda"] },
  "치마": { subcategory: "skirt", category: "Bottom", keywords: ["치마", "스커트", "skirt"] },
  "스커트": { subcategory: "skirt", category: "Bottom", keywords: ["스커트", "치마", "skirt"] },
  "미니스커트": { subcategory: "skirt", category: "Bottom", keywords: ["미니스커트", "미니치마", "mini skirt"] },
  "롱스커트": { subcategory: "skirt", category: "Bottom", keywords: ["롱스커트", "롱치마", "long skirt"] },
  "플리츠스커트": { subcategory: "skirt", category: "Bottom", keywords: ["플리츠스커트", "주름치마", "pleated skirt"] },
  "조거팬츠": { subcategory: "joggers", category: "Bottom", keywords: ["조거팬츠", "조거", "jogger pants"] },
  "조거": { subcategory: "joggers", category: "Bottom", keywords: ["조거", "조거팬츠", "jogger"] },
  "카고팬츠": { subcategory: "cargo-pants", category: "Bottom", keywords: ["카고팬츠", "카고", "cargo pants"] },
  "카고": { subcategory: "cargo-pants", category: "Bottom", keywords: ["카고", "카고팬츠", "cargo"] },
  "카고바지": { subcategory: "cargo-pants", category: "Bottom", keywords: ["카고바지", "카고팬츠", "cargo pants"] },
  "레깅스": { subcategory: "leggings", category: "Bottom", keywords: ["레깅스", "레깅스팬츠", "leggings"] },
  "쿨로트": { subcategory: "culottes", category: "Bottom", keywords: ["쿨로트", "큘로트", "culottes"] },
  "트레이닝": { subcategory: "sweatpants", category: "Bottom", keywords: ["트레이닝", "츄리닝", "training pants"] },
  "츄리닝": { subcategory: "sweatpants", category: "Bottom", keywords: ["츄리닝", "트레이닝", "sweatpants"] },
  "스웻팬츠": { subcategory: "sweatpants", category: "Bottom", keywords: ["스웻팬츠", "sweatpants"] },
  "바지": { subcategory: "trousers", category: "Bottom", keywords: ["바지", "팬츠", "pants"] },
  "팬츠": { subcategory: "trousers", category: "Bottom", keywords: ["팬츠", "바지", "pants"] },
  "스키니": { subcategory: "jeans", category: "Bottom", keywords: ["스키니", "스키니진", "skinny jeans"] },
  "스키니진": { subcategory: "jeans", category: "Bottom", keywords: ["스키니진", "스키니", "skinny jeans"] },
  "부츠컷": { subcategory: "jeans", category: "Bottom", keywords: ["부츠컷", "bootcut", "boot cut jeans"] },
  "배기": { subcategory: "wide-pants", category: "Bottom", keywords: ["배기", "배기팬츠", "baggy"] },
  "배기팬츠": { subcategory: "wide-pants", category: "Bottom", keywords: ["배기팬츠", "배기", "baggy pants"] },
  "벌룬팬츠": { subcategory: "wide-pants", category: "Bottom", keywords: ["벌룬팬츠", "벌룬", "balloon pants"] },
  "테이퍼드": { subcategory: "trousers", category: "Bottom", keywords: ["테이퍼드", "테이퍼드팬츠", "tapered"] },
  "밴딩바지": { subcategory: "joggers", category: "Bottom", keywords: ["밴딩바지", "밴딩팬츠", "banding pants"] },
  "나팔바지": { subcategory: "wide-pants", category: "Bottom", keywords: ["나팔바지", "플레어", "flared pants"] },
  "플레어팬츠": { subcategory: "wide-pants", category: "Bottom", keywords: ["플레어팬츠", "플레어", "flared pants"] },
  "파라슈트팬츠": { subcategory: "cargo-pants", category: "Bottom", keywords: ["파라슈트팬츠", "파라슈트", "parachute pants"] },
  "데님스커트": { subcategory: "skirt", category: "Bottom", keywords: ["데님스커트", "청치마", "denim skirt"] },
  "청치마": { subcategory: "skirt", category: "Bottom", keywords: ["청치마", "데님스커트", "denim skirt"] },
  "테니스스커트": { subcategory: "skirt", category: "Bottom", keywords: ["테니스스커트", "tennis skirt"] },
  "쫄바지": { subcategory: "leggings", category: "Bottom", keywords: ["쫄바지", "스키니", "skinny pants"] },

  // ─── Shoes ───
  "운동화": { subcategory: "sneakers", category: "Shoes", keywords: ["운동화", "스니커즈", "sneakers"] },
  "스니커즈": { subcategory: "sneakers", category: "Shoes", keywords: ["스니커즈", "운동화", "sneakers"] },
  "구두": { subcategory: "oxford", category: "Shoes", keywords: ["구두", "옥스포드", "oxford"] },
  "로퍼": { subcategory: "loafers", category: "Shoes", keywords: ["로퍼", "loafers"] },
  "페니로퍼": { subcategory: "loafers", category: "Shoes", keywords: ["페니로퍼", "penny loafer"] },
  "더비슈즈": { subcategory: "derby", category: "Shoes", keywords: ["더비슈즈", "더비", "derby"] },
  "부츠": { subcategory: "boots", category: "Shoes", keywords: ["부츠", "boots"] },
  "워커": { subcategory: "combat-boots", category: "Shoes", keywords: ["워커", "워커부츠", "combat boots"] },
  "워커부츠": { subcategory: "combat-boots", category: "Shoes", keywords: ["워커부츠", "워커", "combat boots"] },
  "첼시부츠": { subcategory: "chelsea-boots", category: "Shoes", keywords: ["첼시부츠", "첼시", "chelsea boots"] },
  "앵클부츠": { subcategory: "boots", category: "Shoes", keywords: ["앵클부츠", "ankle boots"] },
  "사이드집부츠": { subcategory: "chelsea-boots", category: "Shoes", keywords: ["사이드집부츠", "side zip boots"] },
  "롱부츠": { subcategory: "boots", category: "Shoes", keywords: ["롱부츠", "long boots"] },
  "샌들": { subcategory: "sandals", category: "Shoes", keywords: ["샌들", "샌달", "sandals"] },
  "쪼리": { subcategory: "slides", category: "Shoes", keywords: ["쪼리", "슬리퍼", "flip flop"] },
  "슬리퍼": { subcategory: "slides", category: "Shoes", keywords: ["슬리퍼", "슬라이드", "slides"] },
  "슬라이드": { subcategory: "slides", category: "Shoes", keywords: ["슬라이드", "슬리퍼", "slides"] },
  "뮬": { subcategory: "mules", category: "Shoes", keywords: ["뮬", "mules"] },
  "러닝화": { subcategory: "running-shoes", category: "Shoes", keywords: ["러닝화", "런닝화", "running shoes"] },
  "런닝화": { subcategory: "running-shoes", category: "Shoes", keywords: ["런닝화", "러닝화", "running shoes"] },
  "하이탑": { subcategory: "sneakers", category: "Shoes", keywords: ["하이탑", "high top"] },
  "로우탑": { subcategory: "sneakers", category: "Shoes", keywords: ["로우탑", "low top"] },
  "캔버스화": { subcategory: "sneakers", category: "Shoes", keywords: ["캔버스화", "캔버스", "canvas shoes"] },
  "플랫슈즈": { subcategory: "flats", category: "Shoes", keywords: ["플랫슈즈", "플랫", "flats"] },
  "힐": { subcategory: "heels", category: "Shoes", keywords: ["힐", "하이힐", "heels"] },
  "하이힐": { subcategory: "heels", category: "Shoes", keywords: ["하이힐", "힐", "high heels"] },
  "펌프스": { subcategory: "heels", category: "Shoes", keywords: ["펌프스", "pumps"] },
  "에스파드리유": { subcategory: "flats", category: "Shoes", keywords: ["에스파드리유", "espadrille"] },
  "어글리슈즈": { subcategory: "sneakers", category: "Shoes", keywords: ["어글리슈즈", "chunky sneakers"] },
  "키높이": { subcategory: "sneakers", category: "Shoes", keywords: ["키높이", "플랫폼", "platform"] },

  // ─── Bag ───
  "에코백": { subcategory: "tote", category: "Bag", keywords: ["에코백", "토트", "tote"] },
  "토트백": { subcategory: "tote", category: "Bag", keywords: ["토트백", "토트", "tote bag"] },
  "숄더백": { subcategory: "shoulder-bag", category: "Bag", keywords: ["숄더백", "shoulder bag"] },
  "크로스백": { subcategory: "crossbody", category: "Bag", keywords: ["크로스백", "크로스바디", "crossbody"] },
  "메신저백": { subcategory: "messenger", category: "Bag", keywords: ["메신저백", "메신저", "messenger bag"] },
  "백팩": { subcategory: "backpack", category: "Bag", keywords: ["백팩", "배낭", "backpack"] },
  "배낭": { subcategory: "backpack", category: "Bag", keywords: ["배낭", "백팩", "backpack"] },
  "힙색": { subcategory: "belt-bag", category: "Bag", keywords: ["힙색", "벨트백", "웨이스트백", "belt bag"] },
  "웨이스트백": { subcategory: "belt-bag", category: "Bag", keywords: ["웨이스트백", "힙색", "waist bag"] },
  "클러치": { subcategory: "clutch", category: "Bag", keywords: ["클러치", "clutch"] },
  "파우치": { subcategory: "clutch", category: "Bag", keywords: ["파우치", "pouch"] },
  "버킷백": { subcategory: "bucket-bag", category: "Bag", keywords: ["버킷백", "bucket bag"] },
  "서류가방": { subcategory: "briefcase", category: "Bag", keywords: ["서류가방", "브리프케이스", "briefcase"] },
  "보스턴백": { subcategory: "tote", category: "Bag", keywords: ["보스턴백", "boston bag"] },
  "미니백": { subcategory: "crossbody", category: "Bag", keywords: ["미니백", "mini bag"] },
  "사코슈": { subcategory: "crossbody", category: "Bag", keywords: ["사코슈", "sacoche"] },

  // ─── Dress ───
  "원피스": { subcategory: "midi-dress", category: "Dress", keywords: ["원피스", "드레스", "dress"] },
  "드레스": { subcategory: "midi-dress", category: "Dress", keywords: ["드레스", "원피스", "dress"] },
  "미니원피스": { subcategory: "mini-dress", category: "Dress", keywords: ["미니원피스", "미니드레스", "mini dress"] },
  "맥시원피스": { subcategory: "maxi-dress", category: "Dress", keywords: ["맥시원피스", "맥시", "maxi dress"] },
  "롱원피스": { subcategory: "maxi-dress", category: "Dress", keywords: ["롱원피스", "롱드레스", "long dress"] },
  "셔츠원피스": { subcategory: "shirt-dress", category: "Dress", keywords: ["셔츠원피스", "셔츠드레스", "shirt dress"] },
  "랩원피스": { subcategory: "wrap-dress", category: "Dress", keywords: ["랩원피스", "랩드레스", "wrap dress"] },
  "슬립드레스": { subcategory: "slip-dress", category: "Dress", keywords: ["슬립드레스", "슬립원피스", "slip dress"] },
  "니트원피스": { subcategory: "knit-dress", category: "Dress", keywords: ["니트원피스", "니트드레스", "knit dress"] },
  "점프수트": { subcategory: "midi-dress", category: "Dress", keywords: ["점프수트", "jumpsuit"] },
  "오버올": { subcategory: "midi-dress", category: "Dress", keywords: ["오버올", "멜빵바지", "overall"] },
  "멜빵바지": { subcategory: "midi-dress", category: "Dress", keywords: ["멜빵바지", "오버올", "overall"] },
  "롬퍼": { subcategory: "mini-dress", category: "Dress", keywords: ["롬퍼", "romper"] },

  // ─── Accessories ───
  "모자": { subcategory: "cap", category: "Accessories", keywords: ["모자", "캡", "cap"] },
  "볼캡": { subcategory: "cap", category: "Accessories", keywords: ["볼캡", "야구모자", "cap"] },
  "야구모자": { subcategory: "cap", category: "Accessories", keywords: ["야구모자", "볼캡", "baseball cap"] },
  "버킷햇": { subcategory: "hat", category: "Accessories", keywords: ["버킷햇", "벙거지", "bucket hat"] },
  "벙거지": { subcategory: "hat", category: "Accessories", keywords: ["벙거지", "버킷햇", "bucket hat"] },
  "비니": { subcategory: "hat", category: "Accessories", keywords: ["비니", "beanie"] },
  "페도라": { subcategory: "hat", category: "Accessories", keywords: ["페도라", "fedora"] },
  "베레모": { subcategory: "hat", category: "Accessories", keywords: ["베레모", "베레", "beret"] },
  "머플러": { subcategory: "scarf", category: "Accessories", keywords: ["머플러", "목도리", "muffler", "scarf"] },
  "목도리": { subcategory: "scarf", category: "Accessories", keywords: ["목도리", "머플러", "scarf"] },
  "스카프": { subcategory: "scarf", category: "Accessories", keywords: ["스카프", "scarf"] },
  "넥타이": { subcategory: "tie", category: "Accessories", keywords: ["넥타이", "타이", "tie"] },
  "장갑": { subcategory: "gloves", category: "Accessories", keywords: ["장갑", "gloves"] },
  "양말": { subcategory: "socks", category: "Accessories", keywords: ["양말", "삭스", "socks"] },
  "삭스": { subcategory: "socks", category: "Accessories", keywords: ["삭스", "양말", "socks"] },
  "벨트": { subcategory: "belt", category: "Accessories", keywords: ["벨트", "belt"] },
  "가죽벨트": { subcategory: "belt", category: "Accessories", keywords: ["가죽벨트", "leather belt"] },
  "선글라스": { subcategory: "sunglasses", category: "Accessories", keywords: ["선글라스", "썬글라스", "sunglasses"] },
  "안경": { subcategory: "sunglasses", category: "Accessories", keywords: ["안경", "glasses"] },
  "시계": { subcategory: "watch", category: "Accessories", keywords: ["시계", "watch"] },
  "목걸이": { subcategory: "necklace", category: "Accessories", keywords: ["목걸이", "necklace"] },
  "팔찌": { subcategory: "bracelet", category: "Accessories", keywords: ["팔찌", "bracelet"] },
  "반지": { subcategory: "ring", category: "Accessories", keywords: ["반지", "ring"] },
  "귀걸이": { subcategory: "earrings", category: "Accessories", keywords: ["귀걸이", "이어링", "earrings"] },
  "이어링": { subcategory: "earrings", category: "Accessories", keywords: ["이어링", "귀걸이", "earrings"] },
  "뱅글": { subcategory: "bracelet", category: "Accessories", keywords: ["뱅글", "bangle"] },

  // ─── 빈출 용어 보강 (크롤링 데이터 기반) ───
  "롱슬리브": { subcategory: "t-shirt", category: "Top", keywords: ["롱슬리브", "긴팔", "long sleeve"] },
  "하이넥": { subcategory: "turtleneck", category: "Top", keywords: ["하이넥", "터틀넥", "high neck"] },
  "하이넥니트": { subcategory: "turtleneck", category: "Top", keywords: ["하이넥니트", "터틀넥니트", "high neck knit"] },
  "보트넥": { subcategory: "t-shirt", category: "Top", keywords: ["보트넥", "boat neck"] },
  "오프숄더": { subcategory: "blouse", category: "Top", keywords: ["오프숄더", "off shoulder"] },
  "뷔스티에": { subcategory: "camisole", category: "Top", keywords: ["뷔스티에", "bustier"] },
  "홀터넥": { subcategory: "tank-top", category: "Top", keywords: ["홀터넥", "홀터", "halter neck"] },
  "홀터": { subcategory: "tank-top", category: "Top", keywords: ["홀터", "홀터넥", "halter"] },
  "트랙탑": { subcategory: "sweatshirt", category: "Top", keywords: ["트랙탑", "트랙자켓", "track top"] },
  "미디원피스": { subcategory: "midi-dress", category: "Dress", keywords: ["미디원피스", "미디드레스", "midi dress"] },
  "미디드레스": { subcategory: "midi-dress", category: "Dress", keywords: ["미디드레스", "미디원피스", "midi dress"] },
  "랩드레스": { subcategory: "wrap-dress", category: "Dress", keywords: ["랩드레스", "랩원피스", "wrap dress"] },
  "미니드레스": { subcategory: "mini-dress", category: "Dress", keywords: ["미니드레스", "미니원피스", "mini dress"] },
  "맥시드레스": { subcategory: "maxi-dress", category: "Dress", keywords: ["맥시드레스", "맥시원피스", "maxi dress"] },
  "하프팬츠": { subcategory: "shorts", category: "Bottom", keywords: ["하프팬츠", "반바지", "half pants"] },
  "밴딩팬츠": { subcategory: "joggers", category: "Bottom", keywords: ["밴딩팬츠", "밴딩바지", "banding pants"] },
  "트레이닝팬츠": { subcategory: "sweatpants", category: "Bottom", keywords: ["트레이닝팬츠", "트레이닝바지", "training pants"] },
  "트랙팬츠": { subcategory: "sweatpants", category: "Bottom", keywords: ["트랙팬츠", "트랙바지", "track pants"] },
  "핀턱팬츠": { subcategory: "trousers", category: "Bottom", keywords: ["핀턱팬츠", "핀턱", "pintuck pants"] },
  "미디스커트": { subcategory: "skirt", category: "Bottom", keywords: ["미디스커트", "미디치마", "midi skirt"] },
}

// ─── 한국어 → pattern 매핑 ─────────────────────────

export const KOREAN_PATTERN_VOCAB: Record<string, string> = {
  "무지": "solid",
  "민무늬": "solid",
  "단색": "solid",
  "솔리드": "solid",
  "깔끔한": "solid",
  "스트라이프": "stripe",
  "줄무늬": "stripe",
  "줄": "stripe",
  "스트": "stripe",
  "단가라": "stripe",
  "보더": "stripe",
  "체크": "check",
  "격자": "check",
  "깅엄": "check",
  "타탄": "plaid",
  "타탄체크": "plaid",
  "플레이드": "plaid",
  "마드라스": "plaid",
  "아가일": "plaid",
  "하운드투스": "check",
  "글렌체크": "check",
  "윈도우페인": "check",
  "플라워": "floral",
  "꽃무늬": "floral",
  "꽃": "floral",
  "플로럴": "floral",
  "보타니컬": "floral",
  "도트": "dot",
  "물방울": "dot",
  "물방울무늬": "dot",
  "폴카도트": "dot",
  "카모": "camo",
  "카모플라주": "camo",
  "밀리터리무늬": "camo",
  "위장": "camo",
  "애니멀": "animal",
  "레오파드": "animal",
  "호피": "animal",
  "지브라": "animal",
  "뱀": "animal",
  "파이톤": "animal",
  "크로커다일": "animal",
  "악어": "animal",
  "카우": "animal",
  "그래픽": "graphic",
  "프린트": "graphic",
  "로고": "graphic",
  "레터링": "graphic",
  "슬로건": "graphic",
  "일러스트": "graphic",
  "페이즐리": "abstract",
  "추상": "abstract",
  "타이다이": "abstract",
  "마블": "abstract",
  "옴브레": "abstract",
  "헤링본": "check",
  "버팔로체크": "check",
  "자수": "graphic",
  "에스닉": "abstract",
  "보헤미안무늬": "abstract",
  "기하학": "abstract",
  "지오메트릭": "abstract",
  "컬러블록": "graphic",
  "배색": "graphic",
  "투톤": "graphic",
  "그라데이션": "abstract",
  "잔꽃": "floral",
  "땡땡이": "dot",
  "자카드": "abstract",
  "핀스트라이프": "stripe",
  // 빈출 보강
  "엠브로이더": "graphic",
  "엠브로이더드": "graphic",
  "엠브로이더리": "graphic",
  "패치워크": "abstract",
  "시퀸": "graphic",
  "스팽글": "graphic",
  "프린지": "abstract",
  "셔링": "abstract",
  "프릴": "abstract",
}

// ─── 한국어 → fit 매핑 ──────────────────────────────

export const KOREAN_FIT_VOCAB: Record<string, string> = {
  "오버핏": "oversized",
  "오버사이즈": "oversized",
  "오버": "oversized",
  "빅사이즈": "oversized",
  "루즈핏": "relaxed",
  "루즈": "relaxed",
  "릴렉스드": "relaxed",
  "릴렉스": "relaxed",
  "편한": "relaxed",
  "여유있는": "relaxed",
  "레귤러핏": "regular",
  "레귤러": "regular",
  "기본핏": "regular",
  "노멀핏": "regular",
  "표준핏": "regular",
  "슬림핏": "slim",
  "슬림": "slim",
  "타이트": "slim",
  "날씬한": "slim",
  "스키니핏": "skinny",
  "스키니": "skinny",
  "딱붙는": "skinny",
  "박시핏": "boxy",
  "박시": "boxy",
  "사각핏": "boxy",
  "크롭": "cropped",
  "크롭핏": "cropped",
  "짧은": "cropped",
  "배꼽": "cropped",
  "롱핏": "longline",
  "롱라인": "longline",
  "기장긴": "longline",
  "롱기장": "longline",
  "세미오버핏": "relaxed",
  "세미오버": "relaxed",
  "A라인": "relaxed",
  "텐트핏": "oversized",
  "드롭숄더": "oversized",
  "밑단넓은": "oversized",
  "테이퍼드핏": "regular",
  // 빈출 보강
  "오버사이즈드": "oversized",
  "테일러드": "regular",
  "테일러드핏": "regular",
  "스트레이트핏": "regular",
  "벌룬": "oversized",
  "벌룬핏": "oversized",
  "와이드핏": "relaxed",
  "세미와이드": "relaxed",
}

// ─── 한국어 → fabric 매핑 ───────────────────────────

export const KOREAN_FABRIC_VOCAB: Record<string, string> = {
  "면": "cotton",
  "코튼": "cotton",
  "순면": "cotton",
  "오가닉코튼": "cotton",
  "워싱코튼": "cotton",
  "옥스포드": "cotton",
  "모직": "wool",
  "울": "wool",
  "양모": "wool",
  "메리노": "wool",
  "캐시미어": "cashmere",
  "캐시": "cashmere",
  "린넨": "linen",
  "리넨": "linen",
  "마": "linen",
  "마직": "linen",
  "실크": "silk",
  "견": "silk",
  "새틴": "satin",
  "사틴": "satin",
  "데님": "denim",
  "청": "denim",
  "가죽": "leather",
  "레더": "leather",
  "소가죽": "leather",
  "양가죽": "leather",
  "인조가죽": "leather",
  "페이크레더": "leather",
  "스웨이드": "suede",
  "스에이드": "suede",
  "나일론": "nylon",
  "폴리": "polyester",
  "폴리에스터": "polyester",
  "폴리에스테르": "polyester",
  "코듀로이": "corduroy",
  "골덴": "corduroy",
  "골지": "corduroy",
  "플리스": "fleece",
  "후리스": "fleece",
  "양털": "fleece",
  "보아": "fleece",
  "트위드": "tweed",
  "져지": "jersey",
  "저지": "jersey",
  "니트": "knit",
  "편직": "knit",
  "메쉬": "mesh",
  "망사": "mesh",
  "시폰": "chiffon",
  "쉬폰": "chiffon",
  "벨벳": "velvet",
  "벨루어": "velvet",
  "캔버스": "canvas",
  "고어텍스": "gore-tex",
  "고텍스": "gore-tex",
  "립스탑": "ripstop",
  "기모": "fleece",
  "융": "fleece",
  "텐셀": "jersey",
  "레이온": "jersey",
  "비스코스": "jersey",
  "모달": "jersey",
  "스판": "jersey",
  "스판덱스": "jersey",
  "라이크라": "jersey",
  "쿨맥스": "polyester",
  "드라이": "polyester",
  "워싱": "cotton",
  "피그먼트": "cotton",
  "헤비코튼": "cotton",
  "오버다잉": "cotton",
  "타이벡": "nylon",
  "나염": "cotton",
  "자카드": "knit",
  "와플": "knit",
  "테리": "cotton",
  "파일": "fleece",
  "브러쉬드": "fleece",
  "기능성": "polyester",
  "방수": "nylon",
  "방풍": "nylon",
  "알파카": "wool",
  "앙고라": "wool",
  "모헤어": "wool",
  "셀비지": "denim",
  "시어서커": "cotton",
  "거즈": "cotton",
  "포플린": "cotton",
  "트윌": "cotton",
  "샴브레이": "cotton",
  "피케": "cotton",
  "오간자": "chiffon",
  "튤": "chiffon",
  "레이스": "chiffon",
  "네오프렌": "polyester",
  "크레이프": "silk",
  "헴프": "linen",
  "혼방": "cotton",
  "이중지": "cotton",
  "누빔": "polyester",
  "퀼팅": "polyester",
  "다운": "wool",
  "거위털": "wool",
  "오리털": "wool",
  "셰르파": "fleece",
  "뽀글이": "fleece",
  "프렌치테리": "cotton",
  "쭈리": "cotton",
  // 빈출 보강
  "리브": "knit",
  "리브니트": "knit",
  "심리스": "knit",
  "오간디": "chiffon",
  "드레이프": "silk",
  "스쿠버": "polyester",
}

// ─── 한국어 → colorFamily 매핑 ──────────────────────

export const KOREAN_COLOR_VOCAB: Record<string, string> = {
  "검정": "BLACK", "검은색": "BLACK", "검정색": "BLACK", "블랙": "BLACK", "흑색": "BLACK",
  "흰색": "WHITE", "하얀색": "WHITE", "화이트": "WHITE", "백색": "WHITE", "순백": "WHITE",
  "회색": "GREY", "그레이": "GREY", "그레이색": "GREY", "회": "GREY", "차콜": "GREY", "차콜색": "GREY", "진회색": "GREY", "연회색": "GREY", "애쉬": "GREY",
  "네이비": "NAVY", "남색": "NAVY", "진남색": "NAVY", "짙은남색": "NAVY",
  "파란색": "BLUE", "파랑": "BLUE", "블루": "BLUE", "스카이블루": "BLUE", "하늘색": "BLUE", "코발트": "BLUE", "인디고": "BLUE", "로얄블루": "BLUE", "라이트블루": "BLUE", "연청": "BLUE", "중청": "BLUE", "진청": "NAVY",
  "베이지": "BEIGE", "베이지색": "BEIGE", "모래색": "BEIGE", "샌드": "BEIGE",
  "갈색": "BROWN", "브라운": "BROWN", "카멜": "BROWN", "초콜릿": "BROWN", "밤색": "BROWN", "탄색": "BROWN", "모카": "BROWN", "코코아": "BROWN", "커피색": "BROWN", "테라코타": "BROWN", "코냑": "BROWN",
  "초록": "GREEN", "초록색": "GREEN", "녹색": "GREEN", "그린": "GREEN", "올리브": "GREEN", "올리브색": "GREEN", "카키그린": "GREEN", "민트": "GREEN", "에메랄드": "GREEN", "세이지": "GREEN", "포레스트": "GREEN",
  "빨강": "RED", "빨간색": "RED", "레드": "RED", "와인": "RED", "버건디": "RED", "마룬": "RED", "적색": "RED", "체리": "RED", "크림슨": "RED",
  "핑크": "PINK", "분홍": "PINK", "분홍색": "PINK", "로즈": "PINK", "코랄": "PINK", "살구": "PINK", "연핑크": "PINK", "핫핑크": "PINK", "더스티핑크": "PINK",
  "보라": "PURPLE", "보라색": "PURPLE", "퍼플": "PURPLE", "라벤더": "PURPLE", "바이올렛": "PURPLE", "자주": "PURPLE", "자주색": "PURPLE", "플럼": "PURPLE",
  "주황": "ORANGE", "주황색": "ORANGE", "오렌지": "ORANGE", "오렌지색": "ORANGE", "귤색": "ORANGE", "탠저린": "ORANGE",
  "노랑": "YELLOW", "노란색": "YELLOW", "옐로우": "YELLOW", "레몬": "YELLOW", "머스타드": "YELLOW", "겨자색": "YELLOW", "금색": "YELLOW", "골드": "YELLOW",
  "크림": "CREAM", "크림색": "CREAM", "아이보리": "CREAM", "에크루": "CREAM", "미색": "CREAM", "오프화이트": "CREAM", "밀크": "CREAM",
  "카키": "KHAKI", "카키색": "KHAKI", "국방색": "KHAKI",
  "멀티": "MULTI", "멀티컬러": "MULTI", "무지개": "MULTI", "컬러풀": "MULTI",
}

// ─── 한국어 → season 매핑 ───────────────────────────

export const KOREAN_SEASON_VOCAB: Record<string, string> = {
  "봄": "spring", "스프링": "spring", "봄철": "spring",
  "여름": "summer", "썸머": "summer", "여름철": "summer", "한여름": "summer",
  "가을": "fall", "어텀": "fall", "가을철": "fall",
  "겨울": "winter", "윈터": "winter", "겨울철": "winter", "한겨울": "winter",
  "사계절": "all-season", "간절기": "all-season", "환절기": "all-season", "사시사철": "all-season",
  "봄가을": "all-season", "가을겨울": "fall", "여름가을": "all-season",
}

// ─── 검색 함수들 ────────────────────────────────────

/**
 * 한국어 텍스트에서 pattern enum 매칭
 */
export function findKoreanPatternMatch(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const sortedKeys = Object.keys(KOREAN_PATTERN_VOCAB).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (normalized.includes(key)) return KOREAN_PATTERN_VOCAB[key]
  }
  return null
}

/**
 * 한국어 텍스트에서 fit enum 매칭
 */
export function findKoreanFitMatch(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const sortedKeys = Object.keys(KOREAN_FIT_VOCAB).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (normalized.includes(key)) return KOREAN_FIT_VOCAB[key]
  }
  return null
}

/**
 * 한국어 텍스트에서 fabric enum 매칭
 */
export function findKoreanFabricMatch(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const sortedKeys = Object.keys(KOREAN_FABRIC_VOCAB).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (normalized.includes(key)) return KOREAN_FABRIC_VOCAB[key]
  }
  return null
}

/**
 * 한국어 텍스트에서 colorFamily enum 매칭
 */
export function findKoreanColorMatch(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const sortedKeys = Object.keys(KOREAN_COLOR_VOCAB).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (normalized.includes(key)) return KOREAN_COLOR_VOCAB[key]
  }
  return null
}

/**
 * 한국어 텍스트에서 season enum 매칭
 */
export function findKoreanSeasonMatch(text: string): string | null {
  const normalized = text.trim().toLowerCase()
  const sortedKeys = Object.keys(KOREAN_SEASON_VOCAB).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (normalized.includes(key)) return KOREAN_SEASON_VOCAB[key]
  }
  return null
}

/**
 * 한국어 입력 텍스트에서 매칭되는 vocab 엔트리 찾기
 * 가장 긴 매칭을 우선 반환 (e.g., "항공점퍼" > "점퍼")
 */
export function findKoreanVocabMatch(text: string): KoreanVocabEntry | null {
  const normalized = text.trim().toLowerCase()

  // 긴 키부터 매칭 (e.g., "롱패딩" before "패딩")
  const sortedKeys = Object.keys(KOREAN_VOCAB).sort((a, b) => b.length - a.length)

  for (const key of sortedKeys) {
    if (normalized.includes(key)) {
      return KOREAN_VOCAB[key]
    }
  }
  return null
}

/**
 * subcategory용 한국어 키워드 맵 빌드
 * 검색엔진의 SUBCATEGORY_NAME_KEYWORDS에 머지하기 위함
 */
export function buildKoreanKeywordsMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const entry of Object.values(KOREAN_VOCAB)) {
    if (!map[entry.subcategory]) {
      map[entry.subcategory] = []
    }
    for (const kw of entry.keywords) {
      if (!map[entry.subcategory].includes(kw)) {
        map[entry.subcategory].push(kw)
      }
    }
  }
  return map
}

/**
 * 프롬프트에 주입할 한국어 어휘 레퍼런스 텍스트
 */
export function buildKoreanVocabReference(): string {
  const lines: string[] = []
  const byCategory: Record<string, string[]> = {}

  for (const [koreanTerm, entry] of Object.entries(KOREAN_VOCAB)) {
    const cat = entry.category
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(`"${koreanTerm}" → ${entry.subcategory}`)
  }

  for (const [cat, mappings] of Object.entries(byCategory)) {
    lines.push(`  ${cat}: ${mappings.join(", ")}`)
  }

  // Add non-subcategory mappings
  const patternMappings = Object.entries(KOREAN_PATTERN_VOCAB).map(([k, v]) => `"${k}" → ${v}`).join(", ")
  lines.push(`  Pattern: ${patternMappings}`)

  const fitMappings = Object.entries(KOREAN_FIT_VOCAB).map(([k, v]) => `"${k}" → ${v}`).join(", ")
  lines.push(`  Fit: ${fitMappings}`)

  const fabricMappings = Object.entries(KOREAN_FABRIC_VOCAB).map(([k, v]) => `"${k}" → ${v}`).join(", ")
  lines.push(`  Fabric: ${fabricMappings}`)

  return lines.join("\n")
}
