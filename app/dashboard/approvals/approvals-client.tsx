"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Loader2, Paperclip, X } from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";
import { PerformanceModal } from "../department/[id]/performance-modal";
import type {
  DepartmentKpiDetailItem,
  MySubmittedPerformanceProgressRow,
  PendingPerformanceListRow,
} from "@/src/lib/kpi-queries";
import type { MonthKey } from "@/src/lib/kpi-month";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  useDepartmentKpiDetail,
  useMySubmittedPerformanceProgress,
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

/** 승인 대기 목록용 — 내 실적 현황에서는 사용하지 않음 */
function performanceActionKindBadgeClass(kind: string): string {
  if (kind === "—") return "bg-slate-50 text-slate-500 ring-slate-200";
  if (kind === "신규") return "bg-slate-100 text-slate-800 ring-slate-200";
  if (kind === "재등록") return "bg-violet-100 text-violet-900 ring-violet-200";
  return "bg-sky-100 text-sky-900 ring-sky-200";
}

function progressBadgeClass(label: string): string {
  if (label === "1차 승인 대기") {
    return "bg-amber-100 text-amber-900 ring-amber-200";
  }
  if (label === "최종 승인 대기") {
    return "bg-sky-100 text-sky-900 ring-sky-200";
  }
  if (label === "반려") {
    return "bg-red-100 text-red-900 ring-red-200";
  }
  if (label === "회수됨") {
    return "bg-orange-100 text-orange-900 ring-orange-200";
  }
  if (label === "승인 완료") {
    return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function MySubmittedProgressTable({
  rows,
  onOpenRow,
}: {
  rows: MySubmittedPerformanceProgressRow[];
  onOpenRow: (row: MySubmittedPerformanceProgressRow) => void;
}) {
  function rowOpenable(r: MySubmittedPerformanceProgressRow): boolean {
    return Boolean(r.deptId?.trim() && r.kpiItemId?.trim());
  }

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-sky-200 bg-white px-6 py-8 text-center text-sm text-slate-600 shadow-sm shadow-sky-100/40">
        아직 제출한 실적이 없거나, 조회 가능한 건이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
      <div className="overflow-x-auto">
        <table className="table-fixed min-w-[1020px] w-full border-collapse text-sm">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[5%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="bg-sky-50/90 text-left text-slate-700">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-semibold">구분</th>
              <th className="px-4 py-3 font-semibold">KPI 중분류</th>
              <th className="px-4 py-3 font-semibold">KPI 세부내용</th>
              <th className="px-4 py-3 font-semibold">월</th>
              <th className="px-4 py-3 font-semibold">수치</th>
              <th className="px-4 py-3 font-semibold">부서명</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold">
                담당자
              </th>
              <th className="px-4 py-3 font-semibold">진행 내용</th>
              <th className="px-4 py-3 font-semibold">증빙</th>
              <th className="px-4 py-3 font-semibold text-right">진행 현황</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const openable = rowOpenable(row);
              const pct =
                row.achievement_rate !== null
                  ? `${Math.round(Number(row.achievement_rate))}%`
                  : "—";
              return (
                <tr
                  key={row.id}
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                  title={
                    openable
                      ? "클릭하면 해당 KPI·월 실적 창이 열립니다."
                      : undefined
                  }
                  onClick={() => {
                    if (openable) onOpenRow(row);
                  }}
                  onKeyDown={(e) => {
                    if (!openable) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenRow(row);
                    }
                  }}
                  className={`border-t border-sky-50 text-slate-700 transition hover:bg-sky-50/40 ${
                    openable ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="max-w-0 whitespace-nowrap px-4 py-3 text-center tabular-nums text-slate-400">
                    -
                  </td>
                  <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                    {row.kpiSubLabel}
                  </td>
                  <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                    {row.kpiMainLabel}
                  </td>
                  <td className="max-w-0 whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                    {row.periodLabel}
                  </td>
                  <td className="max-w-0 whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-sky-800">
                    {pct}
                  </td>
                  <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                    {row.departmentName}
                  </td>
                  <td className="max-w-0 whitespace-nowrap px-4 py-3 text-slate-800">
                    {row.ownerName?.trim() ? row.ownerName : "—"}
                  </td>
                  <td className="max-w-0 break-words px-4 py-3 text-xs leading-relaxed text-slate-600">
                    {row.description?.trim() ? row.description : "—"}
                  </td>
                  <td
                    className="max-w-0 px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
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
                  <td className="max-w-0 px-4 py-3 text-right align-middle">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${progressBadgeClass(row.progressLabel)}`}
                    >
                      {row.progressLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
            {/*
              table-fixed + colgroup: 1차/최종 테이블 간 헤더·열 위치 동일(최종 승인 테이블 기준 비율 고정).
            */}
            <table className="table-fixed min-w-[1020px] w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[7%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[5%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="bg-sky-50/90 text-left text-slate-700">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">
                    구분
                  </th>
                  <th className="px-4 py-3 font-semibold">KPI 중분류</th>
                  <th className="px-4 py-3 font-semibold">KPI 세부내용</th>
                  <th className="px-4 py-3 font-semibold">월</th>
                  <th className="px-4 py-3 font-semibold">수치</th>
                  <th className="px-4 py-3 font-semibold">부서명</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">
                    담당자
                  </th>
                  <th className="px-4 py-3 font-semibold">진행 내용</th>
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
                      <td className="max-w-0 whitespace-nowrap px-4 py-3 align-middle">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${performanceActionKindBadgeClass(row.performanceActionKind)}`}
                        >
                          {row.performanceActionKind}
                        </span>
                      </td>
                      <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                        {row.kpiSubLabel}
                      </td>
                      <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                        {row.kpiMainLabel}
                      </td>
                      <td className="max-w-0 whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                        {row.periodLabel}
                      </td>
                      <td className="max-w-0 whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-sky-800">
                        {pct}
                      </td>
                      <td className="max-w-0 break-words px-4 py-3 font-medium text-slate-800">
                        {row.departmentName}
                      </td>
                      <td className="max-w-0 whitespace-nowrap px-4 py-3 text-slate-800">
                        {row.ownerName?.trim() ? row.ownerName : "—"}
                      </td>
                      <td className="max-w-0 break-words px-4 py-3 text-xs leading-relaxed text-slate-600">
                        {row.description?.trim() ? row.description : "—"}
                      </td>
                      <td className="max-w-0 px-4 py-3">
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
                      <td className="max-w-0 px-4 py-3 text-right align-middle">
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
  const myProgressEnabled =
    profileQuery.isSuccess &&
    profileQuery.data !== null &&
    (isAdminRole(profileQuery.data.profile.role) ||
      (featureQuery.isSuccess && featureQuery.data?.kpi === true));
  const myProgressQuery = useMySubmittedPerformanceProgress(myProgressEnabled);
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

  type PerfOpenReq = {
    deptId: string;
    kpiItemId: string;
    month: MonthKey | null;
  };
  const [perfOpenReq, setPerfOpenReq] = useState<PerfOpenReq | null>(null);
  const [perfModalItem, setPerfModalItem] =
    useState<DepartmentKpiDetailItem | null>(null);
  const [perfModalDeptId, setPerfModalDeptId] = useState<string | null>(null);
  const [perfModalMonth, setPerfModalMonth] = useState<MonthKey | null>(null);

  const deptIdForModalQuery =
    perfOpenReq?.deptId ?? perfModalDeptId ?? undefined;
  const deptDetailForModal = useDepartmentKpiDetail(deptIdForModalQuery);

  const canEditPerformanceModal = useMemo(() => {
    const p = profileQuery.data;
    if (!p || !perfModalDeptId) return false;
    if (isAdminRole(p.profile.role)) return true;
    const d = typeof p.profile.dept_id === "string" ? p.profile.dept_id : null;
    return Boolean(d && d === perfModalDeptId);
  }, [profileQuery.data, perfModalDeptId]);

  const notify = useCallback(
    (tone: ToastState["tone"], message: string) =>
      setToast({ open: true, tone, message }),
    []
  );

  const handleOpenPerfFromProgressRow = useCallback(
    (row: MySubmittedPerformanceProgressRow) => {
      const d = row.deptId?.trim();
      const kid = row.kpiItemId?.trim();
      if (!d || !kid) {
        notify(
          "info",
          "부서 또는 KPI 정보가 없어 실적 창을 열 수 없습니다."
        );
        return;
      }
      setPerfModalItem(null);
      setPerfModalDeptId(null);
      setPerfModalMonth(null);
      setPerfOpenReq({
        deptId: d,
        kpiItemId: kid,
        month: row.month,
      });
    },
    [notify]
  );

  useEffect(() => {
    if (!perfOpenReq) return;
    if (deptDetailForModal.isPending) return;
    if (deptDetailForModal.isError) return;
    const items = deptDetailForModal.data?.items;
    if (!items) return;
    const item = items.find((i) => i.id === perfOpenReq.kpiItemId);
    if (!item) {
      notify("error", "KPI 항목을 찾을 수 없습니다.");
      setPerfOpenReq(null);
      return;
    }
    setPerfModalItem(item);
    setPerfModalDeptId(perfOpenReq.deptId);
    const m = perfOpenReq.month;
    setPerfModalMonth(m != null && m >= 1 && m <= 12 ? (m as MonthKey) : null);
    setPerfOpenReq(null);
  }, [
    perfOpenReq,
    deptDetailForModal.isPending,
    deptDetailForModal.isError,
    deptDetailForModal.data?.items,
    notify,
  ]);

  useEffect(() => {
    if (!perfOpenReq) return;
    if (!deptDetailForModal.isError) return;
    notify("error", "부서 KPI 정보를 불러오지 못했습니다.");
    setPerfOpenReq(null);
  }, [perfOpenReq, deptDetailForModal.isError, notify]);

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
                실적함
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                &quot;내 실적 진행현황&quot;에서 본인이 제출한 실적의 승인 단계를 확인할 수
                있습니다. 그룹장·팀장·관리자에게는 아래에 실적 승인·반려 처리 목록이
                추가로 표시되며, 승인된 실적은 전체 대시보드 달성률에 반영됩니다.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <CtstUserProfileMenu
                displayName={displayName}
                roleLabel={roleLabelKo(ctx.profile.role)}
                profileUsername={ctx.profile.username}
                userId={ctx.session.user.id}
                notificationsEnabled={featureAccess.kpi}
              />
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:p-8">
          <div className="w-full min-w-0 space-y-10">
            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-slate-800">
                  내 실적 진행현황
                </h2>
                <p className="text-sm text-slate-500">
                  내가 제출·회수한 실적의 현재 상태를 표시합니다. 승인 처리 권한은 없으며,
                  행을 선택하면 이 화면에서 바로 실적 창이 열립니다.
                </p>
              </div>
              {myProgressQuery.isPending ? (
                <div className="h-40 animate-pulse rounded-xl bg-sky-100/60" />
              ) : myProgressQuery.isError ? (
                <div className="rounded-xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-800">
                  {myProgressQuery.error instanceof Error
                    ? myProgressQuery.error.message
                    : "목록을 불러오지 못했습니다."}
                </div>
              ) : (
                <MySubmittedProgressTable
                  rows={myProgressQuery.data ?? []}
                  onOpenRow={handleOpenPerfFromProgressRow}
                />
              )}
            </section>

            {!canSeeApprovals ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-900">
                <p className="font-medium">
                  그룹장·팀장·관리자만 아래와 같이 타인의 실적을 승인·반려할 수 있습니다.
                  본인 제출 건의 진행 현황은 위 목록에서 확인하세요.
                </p>
                <Link
                  href={dashboardListHref}
                  className="mt-2 inline-block text-sky-700 underline-offset-2 hover:underline"
                >
                  전체 대시보드로 돌아가기
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
        </div>

            {perfOpenReq !== null && !deptDetailForModal.isError ? (
              <div
                className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/35 p-4"
                aria-busy
                aria-live="polite"
              >
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-sky-200 bg-white px-8 py-6 shadow-xl">
                  <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
                  <p className="text-sm font-medium text-slate-700">
                    실적 화면을 여는 중…
                  </p>
                </div>
              </div>
            ) : null}

            <PerformanceModal
              isOpen={perfModalItem !== null}
              kpiItem={perfModalItem}
              canEditPerformance={canEditPerformanceModal}
              profileRole={role}
              profileUserId={ctx.session.user.id}
              canFinalizeKpiItem={false}
              initialEditorMonth={perfModalMonth}
              onClose={() => {
                setPerfModalItem(null);
                setPerfModalDeptId(null);
                setPerfModalMonth(null);
                setPerfOpenReq(null);
                void myProgressQuery.refetch();
              }}
            />
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
