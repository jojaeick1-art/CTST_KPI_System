"use client";

import { usePathname, useRouter } from "next/navigation";
import { PerformanceModal } from "./department/[id]/performance-modal";
import { ExternalLink, Loader2, Paperclip } from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  useDepartmentKpiDetail,
  useMyPerformanceInbox,
} from "@/src/hooks/useKpiQueries";
import type {
  DepartmentKpiDetailItem,
  MyPerformanceInboxRow,
} from "@/src/lib/kpi-queries";
import { markInboxRowSeen } from "@/src/lib/kpi-inbox-seen";
import type { MonthKey } from "@/src/lib/kpi-month";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  isAdminRole,
  roleLabelKo,
} from "@/src/lib/rbac";
import { AppToast, type ToastState } from "@/src/components/ui/toast";
import { useCallback, useEffect, useMemo, useState } from "react";

function displayNameFromSession(
  profileFullName: string | null | undefined,
  username: string,
  userMetadata: Record<string, unknown> | undefined
): string {
  const profileName =
    typeof profileFullName === "string" ? profileFullName.trim() : "";
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

function formatWhen(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function pctLabel(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate)}%`;
}

function InboxTable({
  rows,
  variant,
  onOpenDetail,
}: {
  rows: MyPerformanceInboxRow[];
  variant: "rejected" | "withdrawn";
  onOpenDetail: (row: MyPerformanceInboxRow) => void;
}) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-sky-200 bg-white px-6 py-8 text-center text-sm text-slate-600 shadow-sm shadow-sky-100/40">
        {variant === "rejected"
          ? "표시할 반려 건이 없습니다."
          : "회수한 실적이 없습니다."}
      </p>
    );
  }

  function canOpen(r: MyPerformanceInboxRow): boolean {
    return Boolean(r.deptId?.trim());
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
      <div className="overflow-x-auto">
        <table className="table-fixed min-w-[960px] w-full border-collapse text-sm">
          <colgroup>
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[5%]" />
            <col className="w-[7%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[22%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-sky-50/90 text-left text-slate-700">
            <tr>
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
              <th className="px-4 py-3 font-semibold text-right">1차 처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const openable = canOpen(row);
              const metaHint =
                variant === "rejected"
                  ? row.rejection_reason?.trim()
                    ? row.rejection_reason.trim()
                    : "—"
                  : formatWhen(row.withdrawn_at);
              return (
                <tr
                  key={row.id}
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                  title={openable ? metaHint : undefined}
                  onClick={() => {
                    if (openable) onOpenDetail(row);
                  }}
                  onKeyDown={(e) => {
                    if (!openable) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDetail(row);
                    }
                  }}
                  className={`border-t border-sky-50 text-slate-700 transition hover:bg-sky-50/40 ${
                    openable ? "cursor-pointer" : ""
                  }`}
                >
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
                    {pctLabel(row.achievement_rate)}
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
                    <div className="flex flex-wrap justify-end gap-2">
                      {openable ? (
                        <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                          상세 열기
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
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

export function KpiInboxPage({
  variant,
}: {
  variant: "rejected" | "withdrawn";
}) {
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
  const pendingApprovalCount = approvalNotificationCount(
    resolvedRole,
    summaryStatsQuery.data?.pendingPrimaryCount ?? 0,
    summaryStatsQuery.data?.pendingFinalCount ?? 0
  );

  const inboxQueryEnabled =
    profileQuery.isSuccess &&
    profileQuery.data !== null &&
    (isAdminRole(profileQuery.data.profile.role) ||
      (featureQuery.isSuccess && featureQuery.data?.kpi === true));

  const inboxQuery = useMyPerformanceInbox(inboxQueryEnabled);

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

  const deptIdForModalQuery = perfOpenReq?.deptId ?? perfModalDeptId ?? undefined;
  const deptDetailForModal = useDepartmentKpiDetail(deptIdForModalQuery);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(
      () => setToast((prev) => ({ ...prev, open: false })),
      1600
    );
    return () => clearTimeout(t);
  }, [toast.open]);

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) {
      router.replace("/login");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (!perfOpenReq) return;
    if (deptDetailForModal.isPending) return;
    if (deptDetailForModal.isError) return;
    const items = deptDetailForModal.data?.items;
    if (!items) return;
    const item = items.find((i) => i.id === perfOpenReq.kpiItemId);
    if (!item) {
      setToast({
        open: true,
        tone: "error",
        message: "KPI 항목을 찾을 수 없습니다.",
      });
      setPerfOpenReq(null);
      return;
    }
    setPerfModalItem(item);
    setPerfModalDeptId(perfOpenReq.deptId);
    const m = perfOpenReq.month;
    setPerfModalMonth(
      m != null && m >= 1 && m <= 12 ? (m as MonthKey) : null
    );
    setPerfOpenReq(null);
  }, [
    perfOpenReq,
    deptDetailForModal.isPending,
    deptDetailForModal.isError,
    deptDetailForModal.data?.items,
  ]);

  useEffect(() => {
    if (!perfOpenReq) return;
    if (!deptDetailForModal.isError) return;
    setToast({
      open: true,
      tone: "error",
      message: "부서 KPI 정보를 불러오지 못했습니다.",
    });
    setPerfOpenReq(null);
  }, [perfOpenReq, deptDetailForModal.isError]);

  const handleOpenPerfFromInboxRow = useCallback(
    (row: MyPerformanceInboxRow) => {
      const uid = profileQuery.data?.session.user.id;
      if (typeof uid === "string" && uid.length > 0) {
        markInboxRowSeen(uid, row.kind, row.id);
      }
      const d = row.deptId?.trim();
      if (!d) {
        setToast({
          open: true,
          tone: "info",
          message: "부서 정보가 없어 실적 창을 열 수 없습니다.",
        });
        return;
      }
      setPerfModalItem(null);
      setPerfModalDeptId(null);
      setPerfModalMonth(null);
      setPerfOpenReq({
        deptId: d,
        kpiItemId: row.kpiItemId,
        month: row.month,
      });
    },
    [profileQuery.data?.session.user.id]
  );

  const canEditPerformanceModal = useMemo(() => {
    const p = profileQuery.data;
    if (!p || !perfModalDeptId) return false;
    if (isAdminRole(p.profile.role)) return true;
    const d =
      typeof p.profile.dept_id === "string" ? p.profile.dept_id : null;
    return Boolean(d && d === perfModalDeptId);
  }, [profileQuery.data, perfModalDeptId]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const rows = useMemo(() => {
    const data = inboxQuery.data;
    if (!data) return [];
    return variant === "rejected" ? data.rejected : data.withdrawn;
  }, [inboxQuery.data, variant]);

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

  const title = variant === "rejected" ? "반려함" : "회수함";

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
              <h1 className="mt-2 text-xl font-bold text-slate-800">{title}</h1>
              <p className="mt-3 text-sm text-slate-600">KPI 기능이 비공개 상태입니다.</p>
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
                    {title}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {variant === "rejected"
                      ? "내가 제출한 실적 중 승인자가 반려한 건과 사유를 확인할 수 있습니다."
                      : "승인 대기 중에 직접 회수한 실적입니다. 상세 열기에서 수정 후 다시 제출할 수 있습니다."}
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
              <div className="w-full min-w-0 space-y-6">
                {inboxQuery.isPending ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : inboxQuery.isError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {inboxQuery.error instanceof Error
                      ? inboxQuery.error.message
                      : "목록을 불러오지 못했습니다."}
                  </div>
                ) : (
                  <InboxTable
                    rows={rows}
                    variant={variant}
                    onOpenDetail={handleOpenPerfFromInboxRow}
                  />
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
              profileRole={ctx.profile.role}
              profileUserId={ctx.session.user.id}
              canFinalizeKpiItem={false}
              initialEditorMonth={perfModalMonth}
              onClose={() => {
                setPerfModalItem(null);
                setPerfModalDeptId(null);
                setPerfModalMonth(null);
                setPerfOpenReq(null);
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
