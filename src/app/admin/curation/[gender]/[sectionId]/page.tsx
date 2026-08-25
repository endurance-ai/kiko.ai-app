import {notFound} from "next/navigation"
import {CurationEditor} from "@/components/admin/curation-editor"

export default async function EditCurationPage({
  params,
}: {
  params: Promise<{gender: string; sectionId: string}>
}) {
  const {gender, sectionId} = await params
  if (gender !== "women" && gender !== "men") notFound()
  return <CurationEditor gender={gender} sectionId={sectionId} />
}
