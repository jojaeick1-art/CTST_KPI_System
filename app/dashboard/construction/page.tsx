import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { ConstructionDashboardClient } from "./construction-dashboard-client";

export const metadata: Metadata = {
  title: "공사 일정",
  description: "CTST 2Campus 공사 일정",
};

function ConstructionFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default function ConstructionPage() {
  return (
    <Suspense fallback={<ConstructionFallback />}>
      <CtstPortalShell>
        <ConstructionDashboardClient />
      </CtstPortalShell>
    </Suspense>
  );
}
