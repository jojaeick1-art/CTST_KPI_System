"use client";

import { Loader2, Lock } from "lucide-react";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { useAppFeatureAvailability, useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { isAdminRole } from "@/src/lib/rbac";

export function VocPlaceholderContent() {
  const profileQ = useDashboardProfile();
  const featureQ = useAppFeatureAvailability(
    profileQ.isSuccess && profileQ.data !== null
  );
  const isAdmin = isAdminRole(profileQ.data?.profile.role);
  const vocEnabled = featureQ.data?.voc ?? false;
  const canAccessVoc = isAdmin || vocEnabled;

  if (profileQ.isPending || featureQ.isPending) {
    return (
      <CtstPortalShell>
        <div className="flex min-h-full items-center justify-center px-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
        </div>
      </CtstPortalShell>
    );
  }

  return (
    <CtstPortalShell>
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-8 text-center shadow-lg shadow-sky-100/50">
          <img
            src="/c-one%20logo.png?v=4"
            alt="C-ONE 로고"
            className="mx-auto h-auto max-h-[72px] w-auto max-w-[min(100%,240px)] object-contain"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
            CTST 통합 시스템
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-800">VOC</h1>
          {!canAccessVoc ? (
            <>
              <p className="mt-3 text-sm text-slate-600">관리자 잠금 상태입니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                관리자 설정에서 공개되면 이 메뉴를 이용할 수 있습니다.
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                관리자 잠금 상태
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">서비스 준비 중입니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                준비가 완료되면 이 경로에서 이용할 수 있습니다.
              </p>
            </>
          )}
        </div>
      </div>
    </CtstPortalShell>
  );
}
