"use client"

import {useEffect} from "react"
import {initAmplitude} from "@/lib/analytics"

// 랜딩/(chat) 레이아웃에 한 번 마운트 → Amplitude 초기화 + UTM 수집 + main_screen_viewed.
export default function AmplitudeInit() {
  useEffect(() => {
    initAmplitude()
  }, [])
  return null
}
