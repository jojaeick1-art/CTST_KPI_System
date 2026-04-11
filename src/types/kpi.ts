/** 집계·차트용 — `kpi_targets` 반기별 실적은 h1_result/h1_rate, h2_result/h2_rate */
export type KpiPerformanceRow = {
  half_type?: string | null;
  h1_result?: number | string | null;
  h1_rate?: number | string | null;
  h2_result?: number | string | null;
  h2_rate?: number | string | null;
};

/** `kpi_targets` (목표 + 실적·승인) */
export type KpiTargetRow = {
  approval_step?: string | null;
  rejection_reason?: string | null;
  year?: number | string | null;
  half_type?: string | null;
  h1_result?: number | string | null;
  h1_rate?: number | string | null;
  h2_result?: number | string | null;
  h2_rate?: number | string | null;
  remarks?: string | null;
  evidence_url?: string | null;
};

/** 조인 시 `kpi_items` + `kpi_targets` */
export type KpiItemWithPerformances = {
  id: string;
  dept_id: string;
  kpi_targets?: KpiTargetRow[] | null;
};

export type DepartmentRow = {
  id: string;
  name: string;
};

/** 대시보드 부서 카드용 */
export type DepartmentKpiSummary = {
  id: string;
  name: string;
  /** KPI 항목별 대표 달성률(승인 실적 중 최고값)의 부서 평균(%). 없으면 null */
  averageAchievement: number | null;
  kpiItemCount: number;
};
