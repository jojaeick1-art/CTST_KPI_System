import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "대시보드",
  description: "CTST KPI 대시보드 — 부서별 진행 현황",
};

function DashboardFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardClient />
    </Suspense>
  );
}
