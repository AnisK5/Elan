import { Suspense } from "react";
import ProductDashboard from "@/components/admin/ProductDashboard";

export default function AdminProductPage() {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Chargement…</p>}>
      <ProductDashboard />
    </Suspense>
  );
}
