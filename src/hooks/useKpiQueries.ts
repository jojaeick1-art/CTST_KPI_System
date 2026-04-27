"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/src/lib/supabase";
import type { ProfileRow } from "@/src/types/profile";
import { normalizeRole } from "@/src/lib/rbac";
import { logProfileRoleSync } from "@/src/lib/profile-role-debug";
import {
  fetchAppFeatureAvailability,
  createDepartment,
  fetchDepartmentsForManagement,
  fetchKpiPerformancesByItem,
  fetchMonthDeadlines,
  fetchDepartmentKpiDetail,
  fetchDepartmentKpiSummary,
  fetchDashboardSummaryStats,
  fetchPerformancesPendingStage,
  clearAllKpiData,
  extendKpiItemPeriodEndMonth,
  removeKpiItemCascade,
  updateKpiItemFinalCompletion,
  removeDepartment,
  renameDepartment,
  reviewPerformanceWorkflow,
  saveMonthDeadline,
  upsertMonthPerformance,
  upsertQuarterPerformance,
  importKpisFromExcelRows,
  createManualKpiItem,
  updateManualKpiItem,
  type KpiAchievementCap,
  fetchCapaSimulatorEnabled,
  saveAppFeatureAvailability,
  updateKpiItemIndicatorSettings,
  saveCapaSimulatorEnabled,
  type ApprovalWorkflowStage,
  type AppFeatureKey,
  type CreateManualKpiInput,
  type UpdateManualKpiInput,
  type KpiExcelImportRow,
  type KpiIndicatorType,
  type MonthKey,
  type QuarterLabel,
} from "@/src/lib/kpi-queries";

function isParkJaejunProfile(row: {
  username?: unknown;
  full_name?: unknown;
}): boolean {
  const username = String(row.username ?? "").trim().toLowerCase();
  const fullName = String(row.full_name ?? "").trim();
  return username === "pli" || fullName === "박재준";
}

/** React Query 키 — Auth 동기화 컴포넌트에서 무효화 시 동일 키 사용 */
export const DASHBOARD_PROFILE_QUERY_KEY = [
  "supabase",
  "dashboard-profile",
] as const;

export type DashboardProfileData = {
  session: Session;
  profile: ProfileRow;
};

/**
 * 세션은 Supabase 클라이언트에서 읽고, role 등은 항상 `profiles` 테이블에서 조회합니다.
 * (JWT 메타데이터가 아닌 DB가 권한의 단일 소스)
 */
export async function fetchDashboardProfile(): Promise<DashboardProfileData | null> {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const { data: row, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, dept_id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("profiles에 사용자 정보가 없습니다.");
  if (row.id !== session.user.id) {
    throw new Error("profiles.id가 로그인한 사용자와 일치하지 않습니다.");
  }

  const dbRoleRaw =
    row.role === null || row.role === undefined ? "" : String(row.role);
  const normalizedRole = isParkJaejunProfile(row)
    ? "group_team_leader"
    : normalizeRole(dbRoleRaw);
  logProfileRoleSync({
    phase: "fetchDashboardProfile",
    authUid: session.user.id,
    profileRowId: row.id,
    dbRoleRaw: row.role as string | null | undefined,
    normalizedRoleForUi: normalizedRole,
  });

  const profile: ProfileRow = {
    id: row.id,
    username: typeof row.username === "string" ? row.username : "",
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    role: normalizedRole,
    dept_id: row.dept_id,
  };

  return { session, profile };
}

export function useDashboardProfile() {
  const query = useQuery({
    queryKey: DASHBOARD_PROFILE_QUERY_KEY,
    queryFn: fetchDashboardProfile,
    /** role 변경이 곧바로 UI에 반영되도록 캐시를 짧게 두고 주기적으로 재조회 */
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) =>
      query.state.data !== null && query.state.data !== undefined
        ? 45_000
        : false,
  });

  const prevUiRoleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    const d = query.data;
    if (!d) {
      prevUiRoleRef.current = undefined;
      return;
    }
    const r = d.profile.role;
    if (prevUiRoleRef.current === r) return;
    prevUiRoleRef.current = r;
    console.info("[CTST profile] useDashboardProfile · UI에 반영된 role", {
      uiRoleAssigned: r,
    });
  }, [query.data]);

  return query;
}

export function useDepartmentKpiSummary(enabled: boolean) {
  return useQuery({
    queryKey: ["supabase", "department-kpi-summary"],
    queryFn: fetchDepartmentKpiSummary,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useDashboardSummaryStats(
  enabled: boolean,
  filterDeptId?: string | null
) {
  return useQuery({
    queryKey: ["supabase", "dashboard-summary-stats", filterDeptId ?? "all"],
    queryFn: () => fetchDashboardSummaryStats(filterDeptId),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useDepartmentKpiDetail(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["supabase", "department-kpi-detail", departmentId],
    queryFn: () => fetchDepartmentKpiDetail(departmentId!),
    enabled: Boolean(departmentId),
    refetchInterval: 30_000,
  });
}

export function useKpiPerformances(kpiId: string | null) {
  return useQuery({
    queryKey: ["supabase", "kpi-performances", kpiId],
    queryFn: () => fetchKpiPerformancesByItem(kpiId!),
    enabled: Boolean(kpiId),
    refetchInterval: 30_000,
  });
}

/** @deprecated 월별 저장 우선: useUpsertMonthPerformance 사용 */
export function useUpsertQuarterPerformance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      kpiId: string;
      quarter: QuarterLabel;
      achievement_rate: number;
      description: string;
      evidenceUrl?: string | null;
      adminBypassApprovalLock?: boolean;
      actorRole?: string | null;
    }) =>
      upsertQuarterPerformance(
        {
          kpiId: args.kpiId,
          quarter: args.quarter,
          achievement_rate: args.achievement_rate,
          description: args.description,
          evidenceUrl: args.evidenceUrl,
        },
        {
          ...(args.adminBypassApprovalLock
            ? { adminBypassApprovalLock: true }
            : {}),
          ...(args.actorRole !== undefined ? { actorRole: args.actorRole } : {}),
        }
      ),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances", vars.kpiId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "pending-performances"],
      });
    },
  });
}

export function useUpsertMonthPerformance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      kpiId: string;
      month: MonthKey;
      achievement_rate: number;
      description: string;
      bubbleNote?: string | null;
      evidenceUrl?: string | null;
      indicatorMode?: KpiIndicatorType;
      actualValue?: number | null;
      achievementCap?: KpiAchievementCap;
      adminBypassApprovalLock?: boolean;
      actorRole?: string | null;
    }) =>
      upsertMonthPerformance(
        {
          kpiId: args.kpiId,
          month: args.month,
          achievement_rate: args.achievement_rate,
          description: args.description,
          bubbleNote: args.bubbleNote,
          evidenceUrl: args.evidenceUrl,
          indicatorMode: args.indicatorMode,
          actualValue: args.actualValue,
          achievementCap: args.achievementCap,
        },
        {
          ...(args.adminBypassApprovalLock
            ? { adminBypassApprovalLock: true }
            : {}),
          ...(args.actorRole !== undefined ? { actorRole: args.actorRole } : {}),
        }
      ),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances", vars.kpiId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "pending-performances"],
      });
    },
  });
}

export function usePendingPerformances(
  enabled: boolean,
  options: {
    stage: ApprovalWorkflowStage;
    filterDeptId?: string | null;
  }
) {
  return useQuery({
    queryKey: [
      "supabase",
      "pending-performances",
      options.stage,
      options.filterDeptId ?? "all",
    ],
    queryFn: () =>
      fetchPerformancesPendingStage({
        stage: options.stage,
        filterDeptId: options.filterDeptId ?? undefined,
      }),
    enabled,
    refetchInterval: 15_000,
  });
}

export function useWorkflowReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      performanceId: string;
      action: "approve_primary" | "approve_final" | "reject";
      rejectionReason?: string;
      month?: MonthKey | null;
    }) => {
      const opt =
        args.month !== undefined && args.month !== null
          ? { month: args.month }
          : undefined;
      if (args.action === "reject") {
        return reviewPerformanceWorkflow(
          args.performanceId,
          {
            action: "reject",
            rejectionReason: args.rejectionReason ?? "",
          },
          opt
        );
      }
      return reviewPerformanceWorkflow(
        args.performanceId,
        { action: args.action },
        opt
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "pending-performances"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances"],
      });
    },
  });
}

export function useUpdateKpiItemFinalCompletionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { kpiItemId: string; completed: boolean }) =>
      updateKpiItemFinalCompletion(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "dashboard-summary-stats"],
      });
    },
  });
}

export function useDepartmentsForManagement(enabled: boolean) {
  return useQuery({
    queryKey: ["supabase", "departments-management"],
    queryFn: fetchDepartmentsForManagement,
    enabled,
  });
}

export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDepartment(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "departments-management"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
    },
  });
}

export function useRenameDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; name: string }) => renameDepartment(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "departments-management"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
    },
  });
}

export function useDeleteDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) => removeDepartment(departmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "departments-management"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
    },
  });
}

export function useExtendKpiItemPeriodEndMonthMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { kpiItemId: string; nextPeriodEndMonth: MonthKey }) =>
      extendKpiItemPeriodEndMonth(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "dashboard-summary-stats"],
      });
    },
  });
}

export function useDeleteKpiItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kpiItemId: string) => removeKpiItemCascade(kpiItemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "pending-performances"],
      });
    },
  });
}

export function useClearAllKpiDataMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearAllKpiData(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "dashboard-summary-stats"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "pending-performances"],
      });
    },
  });
}

export function useMonthDeadlines(enabled: boolean) {
  return useQuery({
    queryKey: ["supabase", "month-deadlines"],
    queryFn: fetchMonthDeadlines,
    enabled,
  });
}

export function useCapaSimulatorAvailability(enabled: boolean) {
  return useQuery({
    queryKey: ["supabase", "capa-simulator-availability"],
    queryFn: fetchCapaSimulatorEnabled,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useAppFeatureAvailability(enabled: boolean) {
  return useQuery({
    queryKey: ["supabase", "app-feature-availability"],
    queryFn: fetchAppFeatureAvailability,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useSetCapaSimulatorAvailabilityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => saveCapaSimulatorEnabled(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "capa-simulator-availability"],
      });
    },
  });
}

export function useSetAppFeatureAvailabilityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { feature: AppFeatureKey; enabled: boolean }) =>
      saveAppFeatureAvailability(args.feature, args.enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "app-feature-availability"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "capa-simulator-availability"],
      });
    },
  });
}

export function useSaveMonthDeadlineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { month: MonthKey; input_deadline: string | null }) =>
      saveMonthDeadline(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "month-deadlines"],
      });
    },
  });
}

export function useImportKpisByExcelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { deptId: string; rows: KpiExcelImportRow[] }) =>
      importKpisFromExcelRows(args),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail", vars.deptId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
    },
  });
}

export function useCreateManualKpiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateManualKpiInput) => createManualKpiItem(args),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail", vars.deptId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
    },
  });
}

export function useUpdateManualKpiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateManualKpiInput) => updateManualKpiItem(args),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail", vars.deptId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances"],
      });
    },
  });
}

export function useUpdateKpiItemIndicatorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      kpiItemId: string;
      indicatorType: KpiIndicatorType;
      targetPpm: number | null;
    }) => updateKpiItemIndicatorSettings(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "department-kpi-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["supabase", "kpi-performances"],
      });
    },
  });
}
