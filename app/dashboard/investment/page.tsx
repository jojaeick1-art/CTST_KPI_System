import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { InvestmentDashboardClient } from "./investment-dashboard-client";

export const metadata: Metadata = {
  title: "투자",
  description: "투자 심의 대시보드",
};

function InvestmentFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default function InvestmentPage() {
  return (
    <Suspense fallback={<InvestmentFallback />}>
      <CtstPortalShell>
        <InvestmentDashboardClient />
      </CtstPortalShell>
    </Suspense>
  );
}
