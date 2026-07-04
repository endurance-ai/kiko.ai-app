import type {Metadata} from "next"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {ProductCollectionPage} from "@/components/admin/product-collection-page"

export const metadata: Metadata = {title: "제품 수집 큐 · kiko.ai Admin"}
export const dynamic = "force-dynamic"

export default async function ProductCollectionAdminPage() {
  await requireApprovedAdmin()

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">제품 수집 큐</h1>
        <p className="text-sm text-muted-foreground">
          기획자가 승인한 브랜드 공식몰을 crawler 제품 수집 단계로 넘기고 상태를 추적합니다.
        </p>
      </header>
      <ProductCollectionPage />
    </div>
  )
}
