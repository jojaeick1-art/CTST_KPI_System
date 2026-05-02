import type { ProfileRole } from "@/src/types/profile";

/** DB `profiles.role` (레거시 `leader`, `employee` 포함) */
const KNOWN: readonly ProfileRole[] = [
  "admin",
  "ceo",
  "team_leader",
  "group_leader",
  "group_team_leader",
  "principal",
  "manager",
  "senior",
  "pro",
  "leader",
  "employee",
] as const;

/** Supabase에 한글 직급이 저장된 경우 영문 코드로 매핑 */
const KO_ROLE: Record<string, ProfileRole> = {
  관리자: "admin",
  대표: "ceo",
  팀장: "team_leader",
  그룹장: "group_leader",
  "그룹장/팀장": "group_team_leader",
  수석: "principal",
  책임: "manager",
  선임: "senior",
  프로: "pro",
  리더: "team_leader",
  직원: "pro",
};

/**
 * 레거시
 * - leader → 팀장(최종 승인)으로 간주
 * - employee → 프로
 * - 한글 직급 라벨 → 영문 ProfileRole
 * - 영문은 대소문자 무시(admin, ADMIN)
 */
/**
 * DB·UI 한글 `관리자` 포함 — 정규화 후 admin 여부.
 * 관리자는 부서 소속·직무 구분 없이 KPI/실적 편집·승인·시스템 설정 등 앱에서 허용되는
 * 모든 작업을 할 수 있도록 호출부에서 우선 처리한다. (DB RLS는 별도 마이그레이션)
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "admin";
}

export function normalizeRole(role: string | null | undefined): ProfileRole {
  const r = (role ?? "").trim();
  if (!r) return "pro";
  if (r === "leader") return "team_leader";
  if (r === "employee") return "pro";
  const fromKo = KO_ROLE[r];
  if (fromKo) return fromKo;
  const lower = r.toLowerCase();
  if ((KNOWN as readonly string[]).includes(lower)) return lower as ProfileRole;
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    console.warn("[CTST profile] 알 수 없는 profiles.role, UI에서는 pro로 처리:", r);
  }
  return "pro";
}

export function roleLabelKo(role: string | null | undefined): string {
  const n = normalizeRole(role);
  switch (n) {
    case "admin":
      return "관리자";
    case "ceo":
      return "대표";
    case "team_leader":
      return "팀장";
    case "group_leader":
      return "그룹장";
    case "group_team_leader":
      return "그룹장/팀장";
    case "principal":
      return "수석";
    case "manager":
      return "책임";
    case "senior":
      return "선임";
    case "pro":
      return "프로";
    default:
      return role?.trim() || "알 수 없음";
  }
}

/** 대시보드에 모든 부서 카드 표시 (전 계정 공통) */
export function canViewAllDepartmentCards(role: string | null | undefined): boolean {
  void role;
  return true;
}

/**
 * 소속 부서 외 `/dashboard/department/[id]` 접근 제한
 * (대표·관리자 제외, dept_id가 있을 때만 다른 부서 차단)
 */
export function mustRestrictToAssignedDepartment(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n !== "admin" && n !== "ceo";
}

/** 시스템 설정 — 관리자만 (승인/반려 제외) */
export function canAccessSystemSettings(role: string | null | undefined): boolean {
  return normalizeRole(role) === "admin";
}

/** CAPA 레시피(모델·공정·설비) CUD — 관리자·대표·그룹장 */
export function canManageCapaRecipe(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "admin" || n === "ceo" || n === "group_leader" || n === "group_team_leader";
}

/** KPI 엑셀 일괄 등록 — 관리자, 그룹장 */
export function canBulkUploadKpiExcel(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "admin" || n === "group_leader" || n === "group_team_leader";
}

/**
 * KPI 항목 실적 방식(% / PPM / 수량(k) / 건수) 드롭다운 편집
 * — 관리자·그룹장·팀장 (소속 부서 화면은 호출부에서 제한, RLS는 Supabase).
 */
export function canConfigureKpiIndicatorType(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "admin" || n === "group_leader" || n === "team_leader" || n === "group_team_leader";
}

/** 월별 실적 제출(저장) — 그룹장·수석~프로·관리자 (팀장·대표 제외) */
export function canSubmitMonthlyPerformance(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return (
    n === "admin" ||
    n === "group_leader" ||
    n === "group_team_leader" ||
    n === "principal" ||
    n === "manager" ||
    n === "senior" ||
    n === "pro"
  );
}

/** @deprecated 월별 용어로 교체: canSubmitMonthlyPerformance */
export function canSubmitQuarterPerformance(role: string | null | undefined): boolean {
  return canSubmitMonthlyPerformance(role);
}

/** 1차 승인/반려 (그룹장·관리자) */
export function canGroupLeaderApprove(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "admin" || n === "ceo" || n === "group_leader" || n === "group_team_leader";
}

/** 최종 승인/반려 (그룹장·팀장·관리자) */
export function canTeamLeaderFinalApprove(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return (
    n === "admin" ||
    n === "ceo" ||
    n === "group_leader" ||
    n === "team_leader" ||
    n === "group_team_leader"
  );
}

/** 실적함 메뉴·페이지 — 그룹장·팀장·관리자 */
export function canAccessApprovalsPage(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "admin" || n === "ceo" || n === "group_leader" || n === "team_leader" || n === "group_team_leader";
}

const NO_ASSIGNED_DEPARTMENT_APPROVAL_FILTER = "__no_assigned_department__";

/**
 * 실적 승인 알림 배지 범위.
 * - 관리자·대표: 전체 부서 기준
 * - 팀장·그룹장: 본인 소속 부서 기준
 * - 소속 부서가 없으면 빈 결과가 나오도록 불가능한 dept id를 반환
 */
export function approvalNotificationDeptFilter(
  role: string | null | undefined,
  userDeptId: string | null | undefined
): string | null {
  const n = normalizeRole(role);
  if (n === "admin" || n === "ceo") return null;
  if (n === "team_leader" || n === "group_leader" || n === "group_team_leader") {
    return userDeptId?.trim() ? userDeptId : NO_ASSIGNED_DEPARTMENT_APPROVAL_FILTER;
  }
  return NO_ASSIGNED_DEPARTMENT_APPROVAL_FILTER;
}

/** 역할별 사이드바 승인 알림 수. 본인이 처리할 단계만 포함한다. */
export function approvalNotificationCount(
  role: string | null | undefined,
  pendingPrimaryCount: number,
  pendingFinalCount: number
): number {
  const n = normalizeRole(role);
  if (n === "admin" || n === "ceo") {
    return pendingPrimaryCount + pendingFinalCount;
  }
  if (n === "group_team_leader" || n === "group_leader") {
    return pendingPrimaryCount + pendingFinalCount;
  }
  if (n === "team_leader") return pendingFinalCount;
  return 0;
}

/** sessionStorage: 부서 목록을 보려고 `?main=1`로 진입했을 때 자동 리다이렉트 억제 */
export const DASHBOARD_SHOW_MAIN_SESSION_KEY = "ctst_kpi_dashboard_show_main";

export const DASHBOARD_MAIN_QUERY = "main";
export const DASHBOARD_MAIN_QUERY_VALUE = "1";

/**
 * `/dashboard` 진입 시 소속 부서 상세로 자동 이동할지.
 * - admin·ceo: 항상 false
 * - 그 외: 수석~프로·그룹장·팀장만 true (dept_id 유무는 호출부에서 판단)
 */
export function mayAutoRedirectDashboardToAssignedDepartment(
  role: string | null | undefined
): boolean {
  void role;
  // 모든 계정이 대시보드에서 전 부서를 볼 수 있도록 자동 이동 비활성화
  return false;
}

/**
 * 부서 목록(대시보드 메인)으로 이동할 링크.
 * 자동 리다이렉트 대상이고 dept_id가 있으면 `?main=1`로 완화 플래그를 켭니다.
 */
export function hrefDashboardDepartmentList(
  role: string | null | undefined,
  userDeptId: string | null | undefined
): string {
  if (
    mayAutoRedirectDashboardToAssignedDepartment(role) &&
    typeof userDeptId === "string" &&
    userDeptId.length > 0
  ) {
    return `/dashboard?${DASHBOARD_MAIN_QUERY}=${DASHBOARD_MAIN_QUERY_VALUE}`;
  }
  return "/dashboard";
}
