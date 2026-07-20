"use client";

import { Loader2 } from "lucide-react";
import { SmtLineSetupSection } from "@/src/components/smt-line-setup-section";
import { useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { useSmtSetupScheduleBundle } from "@/src/hooks/useSmtSetupSchedule";
import { canEditCampus2Schedule } from "@/src/lib/rbac";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";

export function SetupDashboardClient() {
  const profileQuery = useDashboardProfile();
  const role = profileQuery.data?.profile.role ?? "";
  const scheduleQuery = useSmtSetupScheduleBundle(
    profileQuery.isSuccess && profileQuery.data !== null,
  );

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 h-[95px] shrink-0 border-b border-sky-200 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-8">
        <div className="flex h-full items-center">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
              Set-up
            </h1>
          </div>
        </div>
      </header>
      <div className="px-4 py-6 sm:p-8">
        <div className="grid grid-cols-1 gap-4">
          <SmtLineSetupSection
            year={scheduleQuery.data?.year ?? CURRENT_KPI_YEAR}
            tasks={scheduleQuery.data?.tasks ?? []}
            weekly={scheduleQuery.data?.weekly ?? []}
            weekColumns={scheduleQuery.data?.weekColumns ?? []}
            overallAchievement={scheduleQuery.data?.overallAchievement ?? 0}
            canEdit={canEditCampus2Schedule(role)}
            isLoading={scheduleQuery.isPending}
          />
        </div>
      </div>
    </>
  );
}
