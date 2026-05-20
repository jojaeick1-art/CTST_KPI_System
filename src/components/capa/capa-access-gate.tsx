"use client";

import { Loader2, Lock } from "lucide-react";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { useCapaSimulatorAvailability, useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { canRunCapaSimulator, isAdminRole } from "@/src/lib/rbac";

const centerClass =
  "flex min-h-full flex-col items-center justify-center px-4 py-16";
const cardClass =
  "w-full max-w-md rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-lg shadow-sky-100/50";

export function CapaAccessGate({ children }: { children: React.ReactNode }) {
  const profileQ = useDashboardProfile();
  const capaQ = useCapaSimulatorAvailability(
    profileQ.isSuccess && profileQ.data !== null
  );

  if (profileQ.isPending || capaQ.isPending) {
    return (
      <CtstPortalShell>
        <div className={centerClass}>
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
        </div>
      </CtstPortalShell>
    );
  }

  const role = profileQ.data?.profile.role ?? "";
  const isAdmin = isAdminRole(role);
  const capaEnabled = capaQ.data ?? false;
  const canAccess = isAdmin || (capaEnabled && canRunCapaSimulator(role));

  if (!canAccess) {
    return (
      <CtstPortalShell>
        <div className={centerClass}>
          <div className={cardClass}>
            <img
              src="/c-one%20logo.png?v=4"
              alt="C-ONE 로고"
              className="mx-auto h-auto max-h-[72px] w-auto max-w-[min(100%,240px)] object-contain"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
              CTST 통합 시스템
            </p>
            <h1 className="mt-2 text-xl font-bold text-slate-800">CAPA Simulator</h1>
            <p className="mt-3 text-sm text-slate-600">접근 권한이 없거나 서비스 준비 중입니다.</p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              이용 불가
            </p>
          </div>
        </div>
      </CtstPortalShell>
    );
  }

  return <>{children}</>;
}
