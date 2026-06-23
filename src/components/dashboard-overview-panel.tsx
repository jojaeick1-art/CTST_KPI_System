"use client";

import type { DepartmentKpiSummary } from "@/src/types/kpi";
import type { DashboardSummaryStats } from "@/src/lib/kpi-queries";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";

function currentMonthLabel(): string {
  return `${new Date().getMonth() + 1}월`;
}

function DepartmentCardView({ card }: { card: DepartmentKpiSummary }) {
  const hasAverage = card.averageAchievement !== null;
  const displayPercent = hasAverage ? Number(card.averageAchievement!.toFixed(1)) : 0;
  const progressWidth = Math.max(0, Math.min(100, displayPercent));
  const hasCurrentMonth = card.currentMonthAchievement !== null;
  const currentMonthPercent = hasCurrentMonth
    ? Number(card.currentMonthAchievement!.toFixed(1))
    : null;

  return (
    <article className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-semibold text-slate-800">
          {card.name}
        </h3>
        <span className="text-2xl font-bold tabular-nums text-slate-800">
          {hasAverage ? (
            <>
              {displayPercent}
              <span className="text-sm font-medium text-slate-400">%</span>
            </>
          ) : (
            <span className="text-lg font-semibold text-slate-400">0%</span>
          )}
        </span>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-sky-100"
        role="progressbar"
        aria-valuenow={hasAverage ? displayPercent : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${card.name} 전체보기 평균`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-500 ${
            hasAverage ? "" : "opacity-40"
          }`}
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        KPI 항목 {card.kpiItemCount}건 · 실적 입력 {card.scoredKpiCount}건
      </p>
      <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
        {currentMonthLabel()} 달성률:{" "}
        {currentMonthPercent === null ? "평가 대상 없음" : `${currentMonthPercent}%`}
      </p>
    </article>
  );
}

type Props = {
  summaryStats: DashboardSummaryStats | undefined;
  summaryPending: boolean;
  departments: DepartmentKpiSummary[];
  departmentsPending: boolean;
  departmentsError: boolean;
};

export function DashboardOverviewPanel({
  summaryStats,
  summaryPending,
  departments,
  departmentsPending,
  departmentsError,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-sky-50/90 via-white to-white px-6 py-8 sm:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
            CTST KPI
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            전체 대시보드
          </h1>
          <p className="mt-1 text-sm text-slate-500">부서별 진행 현황</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
          기준 연도: {CURRENT_KPI_YEAR}
        </span>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryPending
          ? [0, 1, 2].map((idx) => (
              <div
                key={`stats-skeleton-${idx}`}
                className="h-[90px] animate-pulse rounded-2xl border border-sky-200 bg-sky-100/60"
              />
            ))
          : [
              {
                label: "전체 KPI 수",
                value: String(summaryStats?.totalKpiCount ?? 0),
              },
              {
                label: "전체 평균 달성률",
                value: `${Number((summaryStats?.averageAchievement ?? 0).toFixed(1))}%`,
              },
              {
                label: "최종 완료 KPI",
                value: `${summaryStats?.finalCompletedKpiCount ?? 0} / ${summaryStats?.totalKpiCount ?? 0} (${Number((((summaryStats?.finalCompletedKpiCount ?? 0) / Math.max(summaryStats?.totalKpiCount ?? 0, 1)) * 100).toFixed(1))}%)`,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40"
              >
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
                  {card.value}
                </p>
              </div>
            ))}
      </div>

      {departmentsPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-sky-100/60"
            />
          ))}
        </div>
      ) : departmentsError ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-6 text-center text-sm text-slate-600">
          부서 KPI 요약을 불러오지 못했습니다.
        </p>
      ) : !departments.length ? (
        <p className="rounded-xl border border-sky-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          등록된 부서가 없습니다.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((card) => (
            <DepartmentCardView key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
