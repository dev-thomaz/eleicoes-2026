import { Suspense } from "react";
import { ElectionDashboard } from "@/features/election/components/ElectionDashboard";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
            Preparando dashboard eleitoral...
          </div>
        </main>
      }
    >
      <ElectionDashboard />
    </Suspense>
  );
}
