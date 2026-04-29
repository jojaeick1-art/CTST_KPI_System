"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  User,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import type { DepartmentKpiSummary } from "@/src/types/kpi";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  canViewAllDepartmentCards,
  DASHBOARD_MAIN_QUERY,
  DASHBOARD_MAIN_QUERY_VALUE,
  DASHBOARD_SHOW_MAIN_SESSION_KEY,
  isAdminRole,
  mayAutoRedirectDashboardToAssignedDepartment,
  roleLabelKo,
} from "@/src/lib/rbac";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  useDepartmentKpiSummary,
} from "@/src/hooks/useKpiQueries";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";
import { ChangePasswordButton } from "./change-password-modal";

function displayNameFromSession(
  profileFullName: string | null | undefined,
  username: string,
  userMetadata: Record<string, unknown> | undefined
): string {
  const profileName = typeof profileFullName === "string" ? profileFullName.trim() : "";
  if (profileName) return profileName;
  const full =
    typeof userMetadata?.full_name === "string"
      ? userMetadata.full_name
      : typeof userMetadata?.name === "string"
        ? userMetadata.name
        : typeof userMetadata?.display_name === "string"
          ? userMetadata.display_name
          : null;
  const t = full?.trim();
  if (t) return t;
  return username;
}

function currentMonthLabel(): string {
  return `${new Date().getMonth() + 1}월`;
}

function DepartmentCard({ card }: { card: DepartmentKpiSummary }) {
  const hasAverage = card.averageAchievement !== null;
  const displayPercent = hasAverage ? Number(card.averageAchievement!.toFixed(1)) : 0;
  const progressWidth = Math.max(0, Math.min(100, displayPercent));
  const hasCurrentMonth = card.currentMonthAchievement !== null;
  const currentMonthPercent = hasCurrentMonth
    ? Number(card.currentMonthAchievement!.toFixed(1))
    : null;

  return (
    <Link
      href={`/dashboard/department/${card.id}`}
      className="block rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40 outline-none ring-sky-300 transition hover:shadow-md hover:shadow-sky-100/60 focus-visible:ring-2"
    >
      <article>
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
    </Link>
  );
}

export function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const profileQuery = useDashboardProfile();
  const deptQuery = useDepartmentKpiSummary(
    profileQuery.isSuccess && profileQuery.data !== null
  );

  const profileData = profileQuery.data;
  const resolvedRole =
    profileQuery.isSuccess && profileData != null
      ? profileData.profile.role
      : undefined;
  const userDeptId =
    profileQuery.isSuccess && profileData != null &&
    typeof profileData.profile.dept_id === "string"
      ? profileData.profile.dept_id
      : null;
  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess && profileQuery.data !== null,
    null
  );
  const approvalStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess &&
      profileQuery.data !== null &&
      resolvedRole !== undefined &&
      canAccessApprovalsPage(resolvedRole),
    approvalNotificationDeptFilter(resolvedRole, userDeptId)
  );
  const featureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null
  );
  const pendingApprovalCount =
    approvalNotificationCount(
      resolvedRole,
      approvalStatsQuery.data?.pendingPrimaryCount ?? 0,
      approvalStatsQuery.data?.pendingFinalCount ?? 0
    );

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) {
      router.replace("/login");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (!profileQuery.isSuccess || profileQuery.data === null) return;
    if (pathname !== "/dashboard") return;

    const mainOpen =
      searchParams.get(DASHBOARD_MAIN_QUERY) === DASHBOARD_MAIN_QUERY_VALUE;
    if (mainOpen) {
      try {
        sessionStorage.setItem(DASHBOARD_SHOW_MAIN_SESSION_KEY, "1");
      } catch {
        /* private mode 등 */
      }
      router.replace("/dashboard");
      return;
    }

    let preferMain = false;
    try {
      preferMain =
        sessionStorage.getItem(DASHBOARD_SHOW_MAIN_SESSION_KEY) === "1";
    } catch {
      preferMain = false;
    }
    if (preferMain) return;

    if (resolvedRole === undefined) return;

    if (
      mayAutoRedirectDashboardToAssignedDepartment(resolvedRole) &&
      userDeptId
    ) {
      router.replace(`/dashboard/department/${userDeptId}`);
    }
  }, [
    profileQuery.isSuccess,
    profileQuery.data,
    resolvedRole,
    userDeptId,
    pathname,
    router,
    searchParams,
  ]);

  const visibleDepartments = useMemo(() => {
    const raw = deptQuery.data ?? [];
    if (!profileData || resolvedRole === undefined) return [];
    if (canViewAllDepartmentCards(resolvedRole)) return raw;
    if (userDeptId) return raw.filter((d) => d.id === userDeptId);
    return [];
  }, [deptQuery.data, profileData, resolvedRole, userDeptId]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <p className="text-sm">대시보드를 불러오는 중…</p>
        </div>
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
  const featureRaw = featureQuery.data ?? { capa: false, voc: false, kpi: false };
  const featureAccess = {
    capa: isAdmin || featureRaw.capa,
    voc: isAdmin || featureRaw.voc,
    kpi: isAdmin || featureRaw.kpi,
  };

  const displayName = displayNameFromSession(
    ctx.profile.full_name,
    ctx.profile.username,
    ctx.session.user.user_metadata as Record<string, unknown> | undefined
  );

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

      <main className="min-w-0 flex-1">
        {!featureAccess.kpi ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
            <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-lg shadow-sky-100/50">
              <img
                src="/c-one%20logo.png?v=4"
                alt="C-ONE 로고"
                className="mx-auto h-auto max-h-[72px] w-auto max-w-[min(100%,240px)] object-contain"
              />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
                CTST 통합 시스템
              </p>
              <h1 className="mt-2 text-xl font-bold text-slate-800">KPI</h1>
              <p className="mt-3 text-sm text-slate-600">관리자 잠금 상태입니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                관리자 설정에서 공개되면 이 메뉴를 이용할 수 있습니다.
              </p>
            </div>
          </div>
        ) : (
        <>
        <header className="h-[95px] border-b border-sky-200 bg-white/80 px-4 backdrop-blur-sm sm:px-8">
          <div className="flex h-full items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                KPI 대시보드
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <p>부서별 진행 현황을 한눈에 확인하세요</p>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                  기준 연도: {CURRENT_KPI_YEAR}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500">
                  연도 선택(준비중)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ChangePasswordButton profileUsername={ctx.profile.username} />
            <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-white px-4 py-2.5 shadow-sm shadow-sky-100/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  <span className="sr-only">접속자 </span>
                  {displayName}
                  <span className="font-normal text-slate-400"> 님</span>
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Shield
                    className="h-3.5 w-3.5 text-sky-600"
                    aria-hidden
                  />
                  <span className="text-xs font-medium text-sky-700">
                    {roleLabelKo(role)}
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-2 text-slate-700">
            <TrendingUp className="h-5 w-5 text-sky-600" aria-hidden />
            <h2 className="text-base font-semibold">
              부서별 KPI 종합점수
            </h2>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summaryStatsQuery.isPending
              ? [0, 1, 2].map((idx) => (
                  <div
                    key={`stats-skeleton-${idx}`}
                    className="h-[90px] animate-pulse rounded-2xl border border-sky-200 bg-sky-100/60"
                  />
                ))
              : [
                  {
                    label: "전체 KPI 수",
                    value: String(summaryStatsQuery.data?.totalKpiCount ?? 0),
                  },
                  {
                    label: "전체 평균 달성률",
                    value: `${Number((summaryStatsQuery.data?.averageAchievement ?? 0).toFixed(1))}%`,
                  },
                  {
                    label: "최종 완료 KPI",
                    value: `${summaryStatsQuery.data?.finalCompletedKpiCount ?? 0} / ${summaryStatsQuery.data?.totalKpiCount ?? 0} (${Number((((summaryStatsQuery.data?.finalCompletedKpiCount ?? 0) / Math.max(summaryStatsQuery.data?.totalKpiCount ?? 0, 1)) * 100).toFixed(1))}%)`,
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

          {!canViewAllDepartmentCards(role) ? (
            <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-slate-700">
              전사 부서 목록은 대표·관리자에게 표시됩니다. 그룹장·팀장은 소속 부서만
              표시되며, 승인 처리는{" "}
              {canAccessApprovalsPage(role) ? (
                <Link
                  href="/dashboard/approvals"
                  className="font-medium text-sky-800 underline-offset-2 hover:underline"
                >
                  실적 승인 관리
                </Link>
              ) : (
                <span className="font-medium text-slate-600">실적 승인 관리</span>
              )}
              에서 진행합니다.
            </p>
          ) : null}

          {deptQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-2xl bg-sky-100/60"
                />
              ))}
            </div>
          ) : deptQuery.isError ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-6 text-center text-sm text-slate-600">
              부서 KPI 요약을 불러오지 못했습니다. 데이터가 없거나 연결 설정을
              확인해 주세요.
            </p>
          ) : !visibleDepartments.length ? (
            <p className="rounded-xl border border-sky-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
              {deptQuery.data?.length
                ? "표시할 부서가 없습니다. profiles.dept_id에 소속 부서 UUID가 올바르게 연결되어 있는지 확인해 주세요."
                : "등록된 부서가 없습니다. Supabase `departments` 테이블에 행을 추가해 주세요."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleDepartments.map((card) => (
                <DepartmentCard key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
}
