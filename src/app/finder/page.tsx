"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const FinderPageInner = dynamic(() => import("@/components/finder/finder-page"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-20">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

export default function FinderPage() {
  return (
    <Suspense>
      <FinderPageInner />
    </Suspense>
  )
}
