import type {Metadata} from "next"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {ProductCollectionPage} from "@/components/admin/product-collection-page"

export const metadata: Metadata = {title: "브랜드 크롤 상태 · kiko.ai Admin"}
export const dynamic = "force-dynamic"

export default async function ProductCollectionAdminPage() {
  await requireApprovedAdmin()

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">브랜드 크롤 상태</h1>
        <p className="text-sm text-muted-foreground">
          brand_nodes에 추가된 브랜드를 기준으로 공식몰 탐지, 크롤 설정, QC, 적재 상태를 추적합니다.
        </p>
      </header>
      <ProductCollectionPage />
    </div>
  )
}
