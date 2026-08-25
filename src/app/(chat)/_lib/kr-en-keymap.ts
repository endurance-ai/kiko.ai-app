// 한/영 키 전환 오타 변환 (두벌식 표준 배열) — 검색어가 반대 자판으로 입력된 경우의
// 변환 후보를 만든다. 예: "ㅗ미ㄹ해ㅛ" → "halfboy", "qlxjtpfwm" → "비터셀즈".
// 서버(web-finder 라우트)에서 브랜드/검색 필터의 OR 후보로 사용.

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]
const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"]
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]

// 자모 → 쿼티 키 (두벌식). 복합 자모는 키 시퀀스로 풀린다.
const JAMO_TO_KEY: Record<string, string> = {
  ㄱ: "r", ㄲ: "R", ㄴ: "s", ㄷ: "e", ㄸ: "E", ㄹ: "f", ㅁ: "a", ㅂ: "q", ㅃ: "Q",
  ㅅ: "t", ㅆ: "T", ㅇ: "d", ㅈ: "w", ㅉ: "W", ㅊ: "c", ㅋ: "z", ㅌ: "x", ㅍ: "v", ㅎ: "g",
  ㅏ: "k", ㅐ: "o", ㅑ: "i", ㅒ: "O", ㅓ: "j", ㅔ: "p", ㅕ: "u", ㅖ: "P",
  ㅗ: "h", ㅘ: "hk", ㅙ: "ho", ㅚ: "hl", ㅛ: "y",
  ㅜ: "n", ㅝ: "nj", ㅞ: "np", ㅟ: "nl", ㅠ: "b",
  ㅡ: "m", ㅢ: "ml", ㅣ: "l",
  ㄳ: "rt", ㄵ: "sw", ㄶ: "sg", ㄺ: "fr", ㄻ: "fa", ㄼ: "fq", ㄽ: "ft", ㄾ: "fx", ㄿ: "fv", ㅀ: "fg", ㅄ: "qt",
}

const KEY_TO_JAMO: Record<string, string> = {
  r: "ㄱ", R: "ㄲ", s: "ㄴ", e: "ㄷ", E: "ㄸ", f: "ㄹ", a: "ㅁ", q: "ㅂ", Q: "ㅃ",
  t: "ㅅ", T: "ㅆ", d: "ㅇ", w: "ㅈ", W: "ㅉ", c: "ㅊ", z: "ㅋ", x: "ㅌ", v: "ㅍ", g: "ㅎ",
  k: "ㅏ", o: "ㅐ", i: "ㅑ", O: "ㅒ", j: "ㅓ", p: "ㅔ", u: "ㅕ", P: "ㅖ",
  h: "ㅗ", y: "ㅛ", n: "ㅜ", b: "ㅠ", m: "ㅡ", l: "ㅣ",
}

const VOWELS = new Set(JUNG)
const isVowel = (j: string) => VOWELS.has(j)

// 복합 중성/종성 결합 규칙
const VOWEL_COMBINE: Record<string, string> = {
  ㅗㅏ: "ㅘ", ㅗㅐ: "ㅙ", ㅗㅣ: "ㅚ", ㅜㅓ: "ㅝ", ㅜㅔ: "ㅞ", ㅜㅣ: "ㅟ", ㅡㅣ: "ㅢ",
}
const JONG_COMBINE: Record<string, string> = {
  ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ", ㄹㅌ: "ㄾ", ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ",
}
const JONG_SPLIT: Record<string, [string, string]> = Object.fromEntries(
  Object.entries(JONG_COMBINE).map(([k, v]) => [v, [k[0], k[1]]])
)

/** 한글(음절·자모) → 영문 키 시퀀스. 한글이 아닌 문자는 그대로. */
export function korToEng(input: string): string {
  let out = ""
  for (const ch of input) {
    const code = ch.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00
      const cho = CHO[Math.floor(idx / 588)]
      const jung = JUNG[Math.floor((idx % 588) / 28)]
      const jong = JONG[idx % 28]
      out += (JAMO_TO_KEY[cho] ?? "") + (JAMO_TO_KEY[jung] ?? "") + (jong ? JAMO_TO_KEY[jong] ?? "" : "")
    } else if (JAMO_TO_KEY[ch]) {
      out += JAMO_TO_KEY[ch]
    } else {
      out += ch
    }
  }
  return out
}

/** 영문 키 시퀀스 → 한글 조합 (두벌식 오토마타). 매핑 없는 문자는 그대로. */
export function engToKor(input: string): string {
  const jamos: string[] = []
  for (const ch of input) {
    const j = KEY_TO_JAMO[ch] ?? KEY_TO_JAMO[ch.toLowerCase()]
    jamos.push(j ?? ch)
  }

  const out: string[] = []
  let cho = "", jung = "", jong = ""
  const flush = () => {
    if (cho && jung) {
      const ci = CHO.indexOf(cho)
      const ji = JUNG.indexOf(jung)
      const gi = JONG.indexOf(jong)
      out.push(String.fromCharCode(0xac00 + ci * 588 + ji * 28 + (gi < 0 ? 0 : gi)))
    } else if (cho) out.push(cho)
    else if (jung) out.push(jung)
    cho = ""; jung = ""; jong = ""
  }

  for (const j of jamos) {
    const isJamo = CHO.includes(j) || VOWELS.has(j) || JONG.includes(j)
    if (!isJamo) {
      flush()
      out.push(j)
      continue
    }
    if (isVowel(j)) {
      if (jong) {
        // 받침을 다음 음절 초성으로 넘김 (겹받침이면 분리)
        const split = JONG_SPLIT[jong]
        const carry = split ? split[1] : jong
        if (split) jong = split[0]
        else jong = ""
        flush()
        cho = carry
        jung = j
      } else if (jung) {
        const combined = VOWEL_COMBINE[jung + j]
        if (combined) jung = combined
        else {
          flush()
          jung = j
        }
      } else {
        jung = j
      }
    } else {
      // 자음
      if (!cho && !jung) cho = j
      else if (cho && !jung) {
        flush()
        cho = j
      } else if (jung && !jong) {
        if (JONG.includes(j)) jong = j
        else {
          flush()
          cho = j
        }
      } else {
        const combined = JONG_COMBINE[jong + j]
        if (combined && JONG.includes(combined)) jong = combined
        else {
          flush()
          cho = j
        }
      }
    }
  }
  flush()
  return out.join("")
}

/** 검색어의 한/영 전환 변환 후보 — 원문과 다를 때만 반환 */
export function keymapVariant(term: string): string | null {
  const hasHangul = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(term)
  const variant = hasHangul ? korToEng(term) : engToKor(term)
  const normalized = variant.trim()
  if (!normalized || normalized.toLowerCase() === term.trim().toLowerCase()) return null
  return normalized
}
