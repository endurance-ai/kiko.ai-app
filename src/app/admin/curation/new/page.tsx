"use client"

import {useSearchParams} from "next/navigation"
import {CurationEditor} from "@/components/admin/curation-editor"

export default function NewCurationPage() {
  const searchParams = useSearchParams()
  return <CurationEditor gender={searchParams.get("gender") === "men" ? "men" : "women"} />
}
