"use client"

import { useEffect, useMemo, useState } from "react"

// kikoai-mobile src/components/pixel-spinner.tsx 의 웹 포트 — AI 에이전트 상태용 3x3 픽셀 로더.
// light 팔레트(#F97316 코어 + warm halo), 7fps 프레임, fade-in 220ms / fade-out 720ms 동일.

type Variant = "emanating" | "streaming" | "rotating" | "syncing" | "wiping" | "rising"

const PATTERNS: Record<Variant, string[]> = {
  emanating: ["000010000", "010111010", "111111111", "101000101", "000000000"],
  streaming: ["100000000", "010100000", "001010100", "000001010", "000000001", "000000000"],
  rotating: [
    "111000000",
    "011001000",
    "001001001",
    "000001011",
    "000000111",
    "000100110",
    "100100100",
    "110100000",
  ],
  syncing: ["100000001", "010000010", "001000100", "000101000"],
  wiping: ["000000000", "100100100", "110110110", "111111111", "011011011", "001001001", "000000000"],
  rising: ["010000100", "000100000", "100000001", "000001000", "001000010", "000010000"],
}

const VARIANTS = Object.keys(PATTERNS) as Variant[]
const FRAME_MS = 1000 / 7
const OFF_OPACITY = 0.16

export default function PixelSpinner({
  pixelSize = 4,
  variant,
}: {
  pixelSize?: number
  variant?: Variant
}) {
  // variant 미지정 시 마운트 시점에 랜덤 하나 고정 (모바일과 동일). 로딩 라인은
  // 유저 인터랙션 후에만 렌더되므로 SSR 히드레이션 불일치 문제 없음.
  const resolved = useMemo<Variant>(
    () => variant ?? VARIANTS[Math.floor(Math.random() * VARIANTS.length)],
    [variant]
  )
  const frames = PATTERNS[resolved]
  const [bits, setBits] = useState("000000000")

  useEffect(() => {
    let f = 0
    setBits("000000000")
    const id = setInterval(() => {
      setBits(frames[f % frames.length])
      f++
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [frames])

  return (
    <span
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${pixelSize}px)`,
        width: pixelSize * 3,
        height: pixelSize * 3,
        flex: "0 0 auto",
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: pixelSize,
            height: pixelSize,
            background: "#F97316",
            opacity: bits[i] === "1" ? 1 : OFF_OPACITY,
            transition: bits[i] === "1" ? "opacity 220ms ease" : "opacity 720ms ease",
            filter: "drop-shadow(0 0 3px rgba(253, 186, 116, 0.5))",
          }}
        />
      ))}
    </span>
  )
}
