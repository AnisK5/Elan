import { Suspense } from "react";
import AdminAnalyticsPage from "./AdminAnalyticsClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
          <p className="mt-24 text-sm text-faint">Chargement…</p>
        </main>
      }
    >
      <AdminAnalyticsPage />
    </Suspense>
  );
}
