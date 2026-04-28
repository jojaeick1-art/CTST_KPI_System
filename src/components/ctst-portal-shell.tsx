"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { canViewAllDepartmentCards, isAdminRole } from "@/src/lib/rbac";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
} from "@/src/hooks/useKpiQueries";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";

export function CtstPortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();

  const profileData = profileQuery.data;
  const resolvedRole =
    profileQuery.isSuccess && profileData != null
      ? profileData.profile.role
      : undefined;
  const userDeptId =
    profileQuery.isSuccess &&
    profileData != null &&
    typeof profileData.profile.dept_id === "string"
      ? profileData.profile.dept_id
      : null;

  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess && profileQuery.data !== null,
    canViewAllDepartmentCards(resolvedRole ?? "") ? null : userDeptId,
  );
  const appFeatureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null,
  );

  const pendingApprovalCount =
    (summaryStatsQuery.data?.pendingPrimaryCount ?? 0) +
    (summaryStatsQuery.data?.pendingFinalCount ?? 0);

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) {
      router.replace("/login");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
      </div>
    );
  }

  if (profileQuery.isError) {
    const msg =
      profileQuery.error instanceof Error
        ? profileQuery.error.message
        : "알 수 없는 오류";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-sky-50/60 px-4">
        <p className="text-center text-sm text-red-700">{msg}</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          로그인으로 이동
        </button>
      </div>
    );
  }

  const ctx = profileQuery.data;
  if (!ctx) {
    return null;
  }

  const role = ctx.profile.role;
  const isAdmin = isAdminRole(role);
  const featureAccessRaw = appFeatureQuery.data ?? {
    capa: false,
    voc: false,
    kpi: false,
  };
  const featureAccess = {
    capa: isAdmin || featureAccessRaw.capa,
    voc: isAdmin || featureAccessRaw.voc || featureAccessRaw.kpi,
    kpi: isAdmin || featureAccessRaw.kpi,
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/90 via-white to-white md:flex-row">
      <CtstAppSidebar
        pathname={pathname}
        role={role}
        userDeptId={userDeptId}
        pendingApprovalCount={pendingApprovalCount}
        featureAccess={featureAccess}
        onSignOut={handleSignOut}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
