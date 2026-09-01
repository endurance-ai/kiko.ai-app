"use client"

import {useState} from "react"
import styles from "./celeb.module.css"
import {track} from "@/lib/analytics"
import {isEmail} from "./_celebs"

function Check() {
  return (
    <svg width="15" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
      <path d="M1 6.5l4.5 4.5L15 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 공용 이메일 리드 폼 — 랜딩 마감 CTA + 상세 섹션3 fake-door 재사용.
export default function LeadForm({
  source,
  celeb,
  cta,
  onDone,
}: {
  source: string
  celeb?: string
  cta: string
  onDone?: () => void
}) {
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)
  const submit = () => {
    if (!isEmail(email)) return
    track("waitlist_lead", {source, celeb: celeb ?? "none", email: email.trim()})
    setDone(true)
    onDone?.()
  }
  if (done) {
    return (
      <div className={styles.leadDone}>
        <Check />
        등록됐어요. 준비되면 가장 먼저 알려드릴게요
      </div>
    )
  }
  return (
    <div className={styles.leadForm}>
      <input
        className={`${styles.leadField} amp-unmask`}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="이메일 주소"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
        }}
      />
      <button className={styles.leadBtn} type="button" onClick={submit}>
        {cta}
      </button>
    </div>
  )
}
