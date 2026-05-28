import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { SetupDashboardClient } from "./setup-dashboard-client";

export const metadata: Metadata = {
  title: "Set-up 현황",
  description: "SMT Line Set-up 현황",
};

function SetupFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<SetupFallback />}>
      <CtstPortalShell>
        <SetupDashboardClient />
      </CtstPortalShell>
    </Suspense>
  );
}
