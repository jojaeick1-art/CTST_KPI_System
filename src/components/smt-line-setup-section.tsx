"use client";

import { useState } from "react";
import type {
  SmtSetupScheduleTask,
  SmtSetupWeekColumn,
  SmtSetupWeeklyPerformance,
} from "@/src/lib/smt-setup-schedule";
import { SmtSetupScheduleDetailModal } from "@/src/components/smt-setup-schedule-detail-modal";

type Props = {
  year: number;
  tasks: SmtSetupScheduleTask[];
  weekly: SmtSetupWeeklyPerformance[];
  weekColumns: SmtSetupWeekColumn[];
  overallAchievement: number;
  canEdit: boolean;
  isLoading?: boolean;
};

export function SmtLineSetupSection({
  year,
  tasks,
  weekly,
  weekColumns,
  overallAchievement,
  canEdit,
  isLoading = false,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const displayPercent = Number(overallAchievement.toFixed(1));
  const progressWidth = Math.max(0, Math.min(100, displayPercent));

  if (isLoading) {
    return (
      <div
        className="h-[90px] w-full animate-pulse rounded-2xl border border-sky-200 bg-sky-100/60"
        aria-hidden
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="block h-full w-full rounded-2xl border border-sky-200 bg-white p-5 text-left shadow-sm shadow-sky-100/40 transition hover:shadow-md hover:shadow-sky-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <article>
          <div className="flex h-8 items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-lg font-semibold leading-none text-slate-800">
              SMT Line Set-up 현황
            </h3>
            <span className="text-2xl font-bold tabular-nums text-slate-800">
              {displayPercent}
              <span className="text-sm font-medium text-slate-400">%</span>
            </span>
          </div>
          <div
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-sky-100"
            role="progressbar"
            aria-valuenow={displayPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="SMT Line Set-up 종합 달성률"
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-500 ${
                displayPercent > 0 ? "" : "opacity-40"
              }`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </article>
      </button>

      <SmtSetupScheduleDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        year={year}
        tasks={tasks}
        weekly={weekly}
        weekColumns={weekColumns}
        overallAchievement={overallAchievement}
        canEdit={canEdit}
      />
    </>
  );
}
