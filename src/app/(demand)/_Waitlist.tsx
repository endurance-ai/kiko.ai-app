"use client"

import {createContext, useCallback, useContext, useEffect, useState} from "react"
import styles from "./celeb.module.css"
import {track} from "@/lib/analytics"
import {CELEBS, isEmail} from "./_celebs"

// 애플 스타일 서베이 모달(iOS 시트) — 이메일 + 원하는 셀럽.
// 어디서든 useWaitlist()(celebId?, source?) 로 연다. 히어로 CTA·상단 이메일·하트·마감 CTA 공용.

type OpenFn = (celebId?: string, source?: string, favText?: string) => void
const Ctx = createContext<OpenFn>(() => {})
export const useWaitlist = () => useContext(Ctx)

// ── 구글폼 리드 저장 ──────────────────────────────────────────────
// 구글폼을 만들고 아래 4개 값만 채우면 백엔드 없이 제출값이 스프레드시트로 저장됨.
//  1) 구글폼 2문항 생성: (1)이메일 (2)좋아하는 셀럽  ← 전부 "단답형"
//  2) 우상단 ⋮ → "미리 채워진 링크 받기" → 각 칸에 아무 값 입력 → "링크 생성"
//  3) 생성된 링크에서 entry.XXXX 숫자를 아래 email/fav 에 복사
//  4) action = 폼 주소의 .../viewform 을 .../formResponse 로 바꾼 것
const GFORM = {
  action:
    "https://docs.google.com/forms/d/e/1FAIpQLScrHaoVxb2gSu5dnodhxLNtWxLCgM80kdhnWpH5FFHUzVmRGw/formResponse",
  email: "entry.1420737381", // 이메일
  fav: "entry.104411108", // 좋아하는 셀럽
  source: "entry.1386810180", // 유입경로(cta/paywall/heart/search) — 폼에 필드 있어 자동 채움
}
async function saveToGoogleForm(data: {email: string; fav: string; source: string}) {
  if (GFORM.action.includes("FORM_ID")) return // 아직 미설정 — 조용히 skip
  const fd = new FormData()
  fd.append(GFORM.email, data.email)
  fd.append(GFORM.fav, data.fav)
  if (GFORM.source) fd.append(GFORM.source, data.source)
  try {
    await fetch(GFORM.action, {method: "POST", mode: "no-cors", body: fd})
  } catch {
    // no-cors라 응답은 못 읽음 — 실패해도 UX 흐름은 유지
  }
}

function Check() {
  return (
    <svg width="16" height="13" viewBox="0 0 16 12" fill="none" aria-hidden="true">
      <path d="M1 6.5l4.5 4.5L15 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Close() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function WaitlistProvider({children}: {children: React.ReactNode}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState("cta")
  const [fav, setFav] = useState("") // 좋아하는 셀럽 (자유 입력)
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)

  const openModal = useCallback<OpenFn>((celebId, src, favText) => {
    // 검색창 입력값(favText) 우선, 없으면 셀럽 상세에서 열 때 그 셀럽 이름으로 프리필
    setFav(favText ?? (celebId ? CELEBS.find((c) => c.id === celebId)?.name ?? "" : ""))
    setSource(src ?? "cta")
    setEmail("")
    setDone(false)
    setOpen(true)
  }, [])

  const close = useCallback(() => setOpen(false), [])
  // 제출 조건: 이메일 형식 유효 + 셀럽 텍스트 필수(내용 무관, 공백만 아니면 OK)
  const canSubmit = isEmail(email) && fav.trim().length > 0
  const submit = () => {
    if (!canSubmit) return
    const payload = {source, email: email.trim(), fav: fav.trim()}
    track("waitlist_lead", payload) // Amplitude 지표
    void saveToGoogleForm(payload) // 구글폼(스프레드시트) 리드 저장
    setDone(true)
  }

  // ESC 닫기 + 바디 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, close])

  return (
    <Ctx.Provider value={openModal}>
      {children}
      <div className={`${styles.sheetWrap} ${open ? styles.sheetOpen : ""}`} aria-hidden={!open}>
        <div className={styles.sheetBackdrop} onClick={close} />
        <div className={styles.sheet} role="dialog" aria-modal="true">
          <button className={styles.sheetClose} type="button" onClick={close} aria-label="닫기">
            <Close />
          </button>

          {done ? (
            <div className={styles.sheetDone}>
              <span className={styles.sheetDoneMark}>
                <Check />
              </span>
              <h2 className={styles.sheetTitle}>초대 명단에 등록됐어요</h2>
              <p className={styles.sheetSub}>준비되는 대로 가장 먼저 초대 링크를 보내드릴게요.</p>
              <button className={styles.sheetSubmit} type="button" onClick={close}>
                닫기
              </button>
            </div>
          ) : (
            <>
              {/* 타이틀 (CTA에서 가치는 이미 전달됨 — 서브 없이 짧게) */}
              <div className={styles.sheetHead}>
                <h2 className={styles.sheetTitle}>최애를 알려주세요.</h2>
              </div>

              {/* 웹 폼 — 이메일 + 좋아하는 셀럽(자유 입력) */}
              <div className={styles.sheetForm}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="wl-email">
                    이메일
                  </label>
                  <input
                    id="wl-email"
                    className={`${styles.webField} amp-unmask`}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit()
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="wl-fav">
                    어떤 셀럽을 좋아하세요?
                  </label>
                  <input
                    id="wl-fav"
                    className={`${styles.webField} amp-unmask`}
                    type="text"
                    placeholder="예: 아일릿 민주, 한소희, 강민경..."
                    value={fav}
                    onChange={(e) => setFav(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit()
                    }}
                  />
                  <p className={styles.fieldHint}>그 셀럽 사복도 찾아드릴게요.</p>
                </div>

                <button
                  className={styles.sheetSubmit}
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                >
                  초대 받기
                </button>
                <p className={styles.sheetNote}>이메일 남겨주시면 초대 링크를 보내드려요.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </Ctx.Provider>
  )
}
