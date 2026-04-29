"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  Paperclip,
  Shield,
  User,
  X,
} from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { ChangePasswordButton } from "../change-password-modal";
import type { PendingPerformanceListRow } from "@/src/lib/kpi-queries";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  usePendingPerformances,
  useWorkflowReviewMutation,
} from "@/src/hooks/useKpiQueries";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  canGroupLeaderApprove,
  canTeamLeaderFinalApprove,
  hrefDashboardDepartmentList,
  isAdminRole,
  roleLabelKo,
} from "@/src/lib/rbac";
import { AppToast, type ToastState } from "@/src/components/ui/toast";

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

function PendingTable({
  title,
  subtitle,
  rows,
  busyId,
  workflowPending,
  variant,
  onApprove,
  onRejectClick,
}: {
  title: string;
  subtitle: string;
  rows: PendingPerformanceListRow[];
  busyId: string | null;
  workflowPending: boolean;
  variant: "primary" | "final";
  onApprove: (row: PendingPerformanceListRow) => void;
  onRejectClick: (row: PendingPerformanceListRow) => void;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {!rows.length ? (
        <p className="rounded-xl border border-sky-200 bg-white px-6 py-8 text-center text-sm text-slate-600">
          대기 중인 실적이 없습니다
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <thead className="bg-sky-50/90 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">부서명</th>
                  <th className="px-4 py-3 font-semibold">KPI 항목</th>
                  <th className="px-4 py-3 font-semibold">기간</th>
                  <th className="px-4 py-3 font-semibold">입력 수치</th>
                  <th className="min-w-[180px] px-4 py-3 font-semibold">
                    담당자 코멘트
                  </th>
                  <th className="px-4 py-3 font-semibold">증빙</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {variant === "primary" ? "1차 처리" : "최종 처리"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const busy = busyId === row.id || workflowPending;
                  const pct =
                    row.achievement_rate !== null
                      ? `${Math.round(Number(row.achievement_rate))}%`
                      : "—";
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-sky-50 text-slate-700 transition hover:bg-sky-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {row.departmentName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">
                          {row.kpiMainLabel}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {row.kpiSubLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {row.periodLabel}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-sky-800">
                        {pct}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-slate-600">
                        {row.description?.trim() ? row.description : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.evidence_url ? (
                          <a
                            href={row.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/50 px-2.5 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            열기
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">없음</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onApprove(row)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {busy && busyId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : variant === "primary" ? (
                              "1차 승인"
                            ) : (
                              "최종 승인"
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onRejectClick(row)}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            반려
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function ApprovalsClient() {
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
  const canSeeApprovals =
    resolvedRole !== undefined && canAccessApprovalsPage(resolvedRole);
  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess && profileQuery.data !== null && canSeeApprovals,
    approvalNotificationDeptFilter(resolvedRole, userDeptId)
  );
  const featureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null
  );
  const pendingApprovalCount =
    approvalNotificationCount(
      resolvedRole,
      summaryStatsQuery.data?.pendingPrimaryCount ?? 0,
      summaryStatsQuery.data?.pendingFinalCount ?? 0
    );
  const isGroupLeader =
    resolvedRole !== undefined && canGroupLeaderApprove(resolvedRole);
  const isTeamLeader =
    resolvedRole !== undefined && canTeamLeaderFinalApprove(resolvedRole);
  /** 관리자: 전 부서 승인 대기 조회 */
  const approvalDeptFilter =
    resolvedRole !== undefined && isAdminRole(resolvedRole)
      ? undefined
      : userDeptId ?? undefined;
  const dashboardListHref =
    resolvedRole !== undefined
      ? hrefDashboardDepartmentList(resolvedRole, userDeptId)
      : "/dashboard";

  const primaryQuery = usePendingPerformances(
    profileQuery.isSuccess && profileQuery.data !== null && canSeeApprovals && isGroupLeader,
    { stage: "primary", filterDeptId: approvalDeptFilter }
  );
  const finalQuery = usePendingPerformances(
    profileQuery.isSuccess && profileQuery.data !== null && canSeeApprovals && isTeamLeader,
    { stage: "final", filterDeptId: approvalDeptFilter }
  );

  const workflowMut = useWorkflowReviewMutation();
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectForId, setRejectForId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });

  const notify = (tone: ToastState["tone"], message: string) =>
    setToast({ open: true, tone, message });

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) {
      router.replace("/login");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(
      () => setToast((prev) => ({ ...prev, open: false })),
      1000
    );
    return () => clearTimeout(t);
  }, [toast.open]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleApprovePrimary(row: PendingPerformanceListRow) {
    try {
      setActingId(row.id);
      await workflowMut.mutateAsync({
        performanceId: row.targetRowId,
        ...(row.month != null ? { month: row.month } : {}),
        action: "approve_primary",
      });
      notify("success", "1차 승인 처리되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "1차 승인 처리에 실패했습니다.");
    } finally {
      setActingId(null);
    }
  }

  async function handleApproveFinal(row: PendingPerformanceListRow) {
    try {
      setActingId(row.id);
      await workflowMut.mutateAsync({
        performanceId: row.targetRowId,
        ...(row.month != null ? { month: row.month } : {}),
        action: "approve_final",
      });
      notify("success", "최종 승인 처리되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "최종 승인 처리에 실패했습니다.");
    } finally {
      setActingId(null);
    }
  }

  async function handleRejectSubmit() {
    if (!rejectForId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      notify("error", "반려 사유를 입력해 주세요.");
      return;
    }
    try {
      setActingId(rejectForId);
      const rejectRow =
        [...(primaryQuery.data ?? []), ...(finalQuery.data ?? [])].find(
          (r) => r.id === rejectForId
        ) ?? null;
      await workflowMut.mutateAsync({
        performanceId: rejectRow?.targetRowId ?? rejectForId,
        ...(rejectRow?.month != null ? { month: rejectRow.month } : {}),
        action: "reject",
        rejectionReason: reason,
      });
      notify("success", "반려 처리되었습니다.");
      setRejectForId(null);
      setRejectReason("");
    } catch (e) {
      notify(
        "error",
        e instanceof Error
          ? `${e.message}\n\n상태·rejection_reason 컬럼 및 RLS를 확인해 주세요.`
          : "반려 처리에 실패했습니다."
      );
    } finally {
      setActingId(null);
    }
  }

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <p className="text-sm">불러오는 중…</p>
        </div>
      </div>
    );
  }

  const ctx = profileQuery.data;
  if (!ctx) return null;

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

  const listError =
    (isGroupLeader && primaryQuery.isError && primaryQuery.error) ||
    (isTeamLeader && finalQuery.isError && finalQuery.error);
  const listLoading =
    (isGroupLeader && primaryQuery.isPending) || (isTeamLeader && finalQuery.isPending);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/90 via-white to-white md:flex-row">
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
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
              <h1 className="mt-2 text-xl font-bold text-slate-800">KPI 승인</h1>
              <p className="mt-3 text-sm text-slate-600">관리자 잠금 상태입니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                관리자 설정에서 공개되면 이 메뉴를 이용할 수 있습니다.
              </p>
            </div>
          </div>
        ) : (
        <>
        <header className="border-b border-sky-200 bg-white/80 px-4 py-4 backdrop-blur-sm sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                실적 승인 관리
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                일반 제출 → 1차 승인 대기(그룹장) → 최종 승인 대기(팀장) → 승인 완료(대시보드
                반영). 그룹장이 제출한 실적은 최종 승인 대기로 바로 이동합니다. 반려 시
                제출 전(draft)으로 돌아갑니다.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <ChangePasswordButton profileUsername={ctx.profile.username} />
              <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-white px-4 py-2.5 shadow-sm shadow-sky-100/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                  <User className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {displayName}
                    <span className="font-normal text-slate-400"> 님</span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-sky-600" aria-hidden />
                    <span className="text-xs font-medium text-sky-700">
                      {roleLabelKo(ctx.profile.role)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:p-8">
          {!canSeeApprovals ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-900">
              <p className="font-medium">
                그룹장·팀장·관리자만 실적 승인 메뉴를 사용할 수 있습니다.
              </p>
              <Link
                href={dashboardListHref}
                className="mt-2 inline-block text-sky-700 underline-offset-2 hover:underline"
              >
                대시보드로 돌아가기
              </Link>
            </div>
          ) : listError ? (
            <div className="rounded-xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-800">
              {listError instanceof Error ? listError.message : "목록을 불러오지 못했습니다."}
            </div>
          ) : listLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-sky-100/60" />
          ) : (
            <>
              {isGroupLeader ? (
                <PendingTable
                  title="1차 승인 대기"
                  subtitle="실적이 제출되면 여기에 표시됩니다. 승인 시 팀장에게 최종 승인 요청이 전달됩니다."
                  rows={primaryQuery.data ?? []}
                  busyId={actingId}
                  workflowPending={workflowMut.isPending}
                  variant="primary"
                  onApprove={(row) => void handleApprovePrimary(row)}
                  onRejectClick={(row) => {
                    setRejectForId(row.id);
                    setRejectReason("");
                  }}
                />
              ) : null}
              {isTeamLeader ? (
                <PendingTable
                  title="최종 승인 대기"
                  subtitle="팀장 최종 승인이 필요한 실적이 표시됩니다. 승인 시 대시보드 달성률에 반영됩니다."
                  rows={finalQuery.data ?? []}
                  busyId={actingId}
                  workflowPending={workflowMut.isPending}
                  variant="final"
                  onApprove={(row) => void handleApproveFinal(row)}
                  onRejectClick={(row) => {
                    setRejectForId(row.id);
                    setRejectReason("");
                  }}
                />
              ) : null}
            </>
          )}
        </div>
        </>
        )}
      </main>

      {rejectForId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-labelledby="reject-title"
            aria-modal="true"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="reject-title" className="text-sm font-semibold text-slate-800">
                반려 사유 입력
              </h2>
              <button
                type="button"
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setRejectForId(null);
                  setRejectReason("");
                }}
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              반려 시 실적은 제출 전(draft) 상태로 돌아가며, 입력자가 수정 후 다시 제출할 수
              있습니다.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 caret-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              placeholder="반려 사유를 입력해 주세요"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setRejectForId(null);
                  setRejectReason("");
                }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={actingId === rejectForId}
                onClick={() => void handleRejectSubmit()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actingId === rejectForId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                반려 확정
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
