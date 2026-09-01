import { Suspense } from "react";
import AdminAnalyticsPage from "./AdminAnalyticsClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-faint">Chargement…</p>
      }
    >
      <AdminAnalyticsPage />
    </Suspense>
  );
}
