import { createBrowserSupabase } from "@/src/lib/supabase";
import { normalizeRole } from "@/src/lib/rbac";
import type {
  DepartmentKpiSummary,
  KpiItemWithPerformances,
  KpiPerformanceRow,
} from "@/src/types/kpi";
import {
  KPI_MONTHS,
  type MonthKey,
  activeMonthsForSchedule,
  monthToHalfTypeLabel,
  monthToLegacyQuarter,
  scheduleMonthsFromItemDates,
} from "@/src/lib/kpi-month";

export {
  KPI_MONTHS,
  KPI_AXIS_START,
  type MonthKey,
  type KpiAxisLabel,
  monthToHalfTypeLabel,
  halfTypeLabelToMonth,
  formatMonthKo,
  formatAxisLabel,
  parseMonthFromScheduleText,
  scheduleMonthsFromItemDates,
  activeMonthsForSchedule,
  monthTargetPercent,
  monthToLegacyQuarter,
} from "@/src/lib/kpi-month";

export const KPI_QUARTERS = [
  "26Y 1Q",
  "26Y 2Q",
  "26Y 3Q",
  "26Y 4Q",
] as const;

export const CURRENT_KPI_YEAR = 2026 as const;

export type QuarterLabel = (typeof KPI_QUARTERS)[number];

/** kpi_targets.approval_step — 2단계 승인 워크플로 (실적·증빙도 동일 행) */
export const PERF_STATUS_DRAFT = "draft";
export const PERF_STATUS_PENDING_PRIMARY = "pending_primary";
export const PERF_STATUS_PENDING_FINAL = "pending_final";
export const PERF_STATUS_APPROVED = "approved";
/** 레거시(구버전 단일 pending) */
export const PERF_LEGACY_PENDING = "pending";

/** 실적 제출 직후 승인 단계. 그룹장 제출은 1차를 생략하고 팀장 최종 승인으로 보냄. */
function approvalStepAfterPerformanceSubmit(
  actorRole: string | null | undefined
): string {
  const actor = normalizeRole(actorRole);
  if (actor === "group_leader") return PERF_STATUS_PENDING_FINAL;
  return PERF_STATUS_PENDING_PRIMARY;
}

/** DB·앱 공통 반기 코드 (kpi_targets.half_type) */
export const HALF_TYPE_H1 = "H1";
export const HALF_TYPE_H2 = "H2";

let kpiTargetsYearColumnCache: boolean | null = null;
let kpiTargetsHalfTypeColumnCache: boolean | null = null;
const kpiTargetsColumnExistsCache = new Map<string, boolean>();

/** kpi_targets 에 실제 존재하는 컬럼만 쓰기 위해 프로브 (캐시) */
export async function getKpiTargetsHasColumn(
  columnName: string
): Promise<boolean> {
  const hit = kpiTargetsColumnExistsCache.get(columnName);
  if (hit === true) return true;
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("kpi_targets")
    .select(columnName)
    .limit(1);
  const ok = !error;
  if (ok) kpiTargetsColumnExistsCache.set(columnName, true);
  return ok;
}

async function filterPayloadToExistingKpiTargetColumns(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (await getKpiTargetsHasColumn(key)) {
      out[key] = value;
    }
  }
  return out;
}

export async function getKpiTargetsHasYearColumn(): Promise<boolean> {
  if (kpiTargetsYearColumnCache !== null) return kpiTargetsYearColumnCache;
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from("kpi_targets").select("year").limit(1);
  kpiTargetsYearColumnCache = !error;
  return kpiTargetsYearColumnCache;
}

export async function getKpiTargetsHasHalfTypeColumn(): Promise<boolean> {
  if (kpiTargetsHalfTypeColumnCache !== null)
    return kpiTargetsHalfTypeColumnCache;
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("kpi_targets")
    .select("half_type")
    .limit(1);
  kpiTargetsHalfTypeColumnCache = !error;
  return kpiTargetsHalfTypeColumnCache;
}

/** 월별 실적 JSON (`performance_monthly`) 컬럼 존재 여부 */
export async function getKpiTargetsHasPerformanceMonthlyColumn(): Promise<boolean> {
  return getKpiTargetsHasColumn("performance_monthly");
}

/** UI 분기 라벨 → DB half_type (1·2Q → H1, 3·4Q → H2) */
export function quarterLabelToHalfTypeCanonical(q: QuarterLabel): string {
  const idx = KPI_QUARTERS.indexOf(q);
  if (idx < 0) return HALF_TYPE_H1;
  return idx < 2 ? HALF_TYPE_H1 : HALF_TYPE_H2;
}

export function normalizeHalfTypeKey(
  raw: string | null | undefined
): string {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "";
  const qMatch = s.match(/([1-4])\s*Q/);
  if (qMatch?.[1]) {
    const q = Number(qMatch[1]);
    return q >= 3 ? HALF_TYPE_H2 : HALF_TYPE_H1;
  }
  if (
    s === "H1" ||
    s === "1" ||
    s === "FIRST" ||
    s === "FIRST_HALF" ||
    s === "상반기" ||
    s === "상반"
  ) {
    return HALF_TYPE_H1;
  }
  if (
    s === "H2" ||
    s === "2" ||
    s === "SECOND" ||
    s === "SECOND_HALF" ||
    s === "하반기" ||
    s === "하반"
  ) {
    return HALF_TYPE_H2;
  }
  return s === HALF_TYPE_H2 ? HALF_TYPE_H2 : HALF_TYPE_H1;
}

export function halfTypeDisplayLabel(halfType: string | null | undefined): string {
  const k = normalizeHalfTypeKey(halfType);
  if (k === HALF_TYPE_H2) return "하반기 (3~4Q)";
  return "상반기 (1~2Q)";
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return null;
  return n;
}

function parsePercentLike(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(100, Math.max(0, v));
  }
  if (typeof v !== "string") return null;
  const m = v.match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function targetRowIsApproved(t: Record<string, unknown>): boolean {
  const s =
    typeof t.approval_step === "string"
      ? t.approval_step.trim().toLowerCase()
      : "";
  return s === PERF_STATUS_APPROVED;
}

function clampPercent100(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * 역지표(PPM) 달성률(%): Max(0, (2 - 실적PPM/목표PPM) * 100).
 * 상한은 두지 않음(목표 대비 실적이 매우 낮으면 100% 초과 가능).
 */
export function reversePpmAchievementPercent(
  actualPpm: number,
  targetPpm: number
): number {
  if (
    !Number.isFinite(actualPpm) ||
    !Number.isFinite(targetPpm) ||
    targetPpm <= 0
  ) {
    return 0;
  }
  return Math.max(0, (2 - actualPpm / targetPpm) * 100);
}

/** DB·UI 공통 — `kpi_items.indicator_type` */
export type KpiIndicatorType = "normal" | "ppm" | "quantity" | "count";

export function indicatorUsesComputedAchievement(
  t: KpiIndicatorType
): t is "ppm" | "quantity" | "count" {
  return t !== "normal";
}

/**
 * 수량(k)·건수: 목표 대비 실적 (실적/목표×100), 0~100%로 표시.
 * 실적이 목표를 넘으면 100%로 캡.
 */
export function quantityCountAchievementPercent(
  actual: number,
  target: number
): number {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return clampPercent100((actual / target) * 100);
}

export function computedAchievementPercent(
  indicator: KpiIndicatorType,
  actual: number,
  target: number
): number {
  if (indicator === "ppm") return reversePpmAchievementPercent(actual, target);
  if (indicator === "quantity" || indicator === "count") {
    return quantityCountAchievementPercent(actual, target);
  }
  return clampPercent100(actual);
}

function parseKpiIndicatorTypeFromDb(raw: unknown): KpiIndicatorType {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "ppm" || s === "reverse" || s === "역지표") return "ppm";
  if (s === "quantity" || s === "수량" || s === "qty") return "quantity";
  if (s === "count" || s === "건수" || s === "cnt") return "count";
  return "normal";
}

function pctRoughlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

/** 상반기·하반기 달성률 표시: *_result 우선, 없으면 *_rate (DB에 achievement_rate 없음) */
function halfYearAchievementPercentFromTarget(
  t: Record<string, unknown>,
  half: typeof HALF_TYPE_H1 | typeof HALF_TYPE_H2
): number | null {
  const p = half === HALF_TYPE_H2 ? "h2" : "h1";
  const resKey = `${p}_result`;
  const rateKey = `${p}_rate`;
  const step =
    typeof t.approval_step === "string"
      ? t.approval_step.trim().toLowerCase()
      : "";
  const n1 = toNum(t[resKey] as number | string | null | undefined);
  if (n1 !== null) return clampPercent100(n1);

  /**
   * draft 단계는 엑셀 목표값(h1_rate/h2_rate)이 들어있을 수 있어
   * 제출 실적으로 오인하지 않도록 rate fallback을 차단.
   * (pending/approved에서만 레거시 호환으로 rate fallback 허용)
   */
  if (step === PERF_STATUS_DRAFT || step === "") {
    return parsePercentLike(t[resKey]);
  }

  const n2 = toNum(t[rateKey] as number | string | null | undefined);
  if (n2 !== null) return clampPercent100(n2);
  const pr = parsePercentLike(t[resKey]) ?? parsePercentLike(t[rateKey]);
  return pr;
}

type PerformanceMonthlyCell = {
  achievement_rate?: number | string | null;
  /** 역지표(PPM) 월별 실적 PPM */
  actual_value?: number | string | null;
  approval_step?: string | null;
  remarks?: string | null;
  evidence_url?: string | null;
  rejection_reason?: string | null;
};

function performanceMonthlyIsNonEmpty(raw: unknown): boolean {
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.keys(raw as object).length > 0
  );
}

/**
 * `performance_monthly`: 월별 달성률을 모두 집계
 * (항목 종합 달성률 계산용).
 */
function pushMonthlyAchievements(
  t: Record<string, unknown>,
  list: number[]
): void {
  const raw = t.performance_monthly;
  if (!performanceMonthlyIsNonEmpty(raw)) return;
  const o = raw as Record<string, unknown>;
  for (const mi of KPI_MONTHS) {
    const cell = o[String(mi)];
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
    const rec = cell as PerformanceMonthlyCell;
    const rate = toNum(rec.achievement_rate as number | string | null | undefined);
    if (rate !== null) {
      list.push(rate);
    }
  }
}

function pushApprovedHalfAchievements(
  t: Record<string, unknown>,
  list: number[],
  hasTargetHalf: boolean
): void {
  if (!targetRowIsApproved(t)) return;
  if (hasTargetHalf && !normalizeHalfTypeKey(String(t.half_type ?? ""))) {
    return;
  }

  /**
   * half_type 컬럼이 없을 때: 한 행에 1Q~4Q 컬럼이 함께 있는 레거시 — 분기마다 실적 수집.
   */
  if (!hasTargetHalf) {
    for (const q of KPI_QUARTERS) {
      const aq = quarterAchievementPercentFromTarget(t, q);
      if (aq !== null) list.push(aq);
    }
    return;
  }

  /**
   * 실적 저장(upsertQuarterPerformance)은 반기당 1행(half_type = H1 | H2)만 씀.
   * H1 행: 1Q→h1_result, 2Q→h1_rate / H2 행: 3Q→h2_result, 4Q→h2_rate.
   * deriveQuarter만 쓰면 일정 텍스트 파싱이 3Q로 고정될 때 4Q(h2_rate)가 집계에서 빠짐.
   */
  const rawHalf = String(t.half_type ?? "").trim().toUpperCase();
  if (rawHalf === HALF_TYPE_H1) {
    for (const q of ["26Y 1Q", "26Y 2Q"] as const) {
      const aq = quarterAchievementPercentFromTarget(t, q);
      if (aq !== null) list.push(aq);
    }
    return;
  }
  if (rawHalf === HALF_TYPE_H2) {
    for (const q of ["26Y 3Q", "26Y 4Q"] as const) {
      const aq = quarterAchievementPercentFromTarget(t, q);
      if (aq !== null) list.push(aq);
    }
    return;
  }

  const q = deriveLegacyQuarterFromTargetRecord(t);
  if (q) {
    const aq = quarterAchievementPercentFromTarget(t, q);
    if (aq !== null) list.push(aq);
    return;
  }
  const a1 = halfYearAchievementPercentFromTarget(t, HALF_TYPE_H1);
  const a2 = halfYearAchievementPercentFromTarget(t, HALF_TYPE_H2);
  if (a1 !== null) list.push(a1);
  if (a2 !== null) list.push(a2);
}

/** 한 KPI 항목의 `kpi_targets` 행들에서 승인된 분기·반기 실적 달성률(0~100)만 수집 */
function collectApprovedAchievementRatesForItemTargets(
  targets: Record<string, unknown>[],
  hasTargetHalf: boolean
): number[] {
  const rates: number[] = [];
  const primaryMonthly = targets.find((t) =>
    performanceMonthlyIsNonEmpty(t.performance_monthly)
  );
  if (primaryMonthly) {
    pushMonthlyAchievements(primaryMonthly, rates);
    return rates;
  }
  for (const t of targets) {
    pushApprovedHalfAchievements(t, rates, hasTargetHalf);
  }
  return rates;
}

/**
 * 목록·집계에서 KPI 항목 1건의 대표 달성률.
 * - 월별 JSON(`performance_monthly`)은 저장된 월 값을 평균 집계.
 * - 레거시 분기·반기도 수집된 값 평균으로 집계.
 */
function representativeAchievementPercentForRates(
  rates: number[]
): number | null {
  if (!rates.length) return null;
  return rates.reduce((acc, r) => acc + r, 0) / rates.length;
}

/** 승인 목록 등 단일 숫자가 필요할 때 (행의 half_type·h1/h2 실적 기준) */
function targetAchievementPercentFromRecord(
  t: Record<string, unknown>
): number | null {
  const range = legacyQuarterRangeFromTargetRecord(t);
  if (range.length) {
    for (let i = range.length - 1; i >= 0; i -= 1) {
      const v = quarterAchievementPercentFromTarget(t, range[i]!);
      if (v !== null) return v;
    }
  }
  const h2Only = halfYearAchievementPercentFromTarget(t, HALF_TYPE_H2);
  const h1Only = halfYearAchievementPercentFromTarget(t, HALF_TYPE_H1);
  return h1Only ?? h2Only;
}

/** 한 행(kpi_targets)의 대표 달성률(0~100) — 집계·호환용 */
export function performanceAchievementPercent(
  p: KpiPerformanceRow | Record<string, unknown>
): number | null {
  return targetAchievementPercentFromRecord(p as Record<string, unknown>);
}

/**
 * departments + kpi_items(kpi_targets 승인·실적) 기준 부서별 평균 달성률.
 * - **승인(approved)**된 목표 행만 집계
 */
export async function fetchDepartmentKpiSummary(): Promise<
  DepartmentKpiSummary[]
> {
  const supabase = createBrowserSupabase();
  const hasYear = await getKpiTargetsHasYearColumn();
  const hasTargetHalf = await getKpiTargetsHasHalfTypeColumn();

  const { data: departments, error: deptErr } = await supabase
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });

  if (deptErr) {
    return [];
  }

  const { data: items, error: itemErr } = await supabase
    .from("kpi_items")
    .select(
      `
      *,
      kpi_targets (*)
    `
    );

  const baseRows = (departments ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    averageAchievement: null as number | null,
    kpiItemCount: 0,
    scoredKpiCount: 0,
    thresholdScore: null as number | null,
    progressScore: null as number | null,
    qualitativeScore: null as number | null,
  }));

  if (itemErr) {
    return baseRows;
  }

  const ratesByDept = new Map<string, number[]>();
  const itemCountByDept = new Map<string, number>();
  const scoredCountByDept = new Map<string, number>();
  const thresholdByDept = new Map<string, Array<{ score: number; weight: number }>>();
  const progressByDept = new Map<string, Array<{ score: number; weight: number }>>();
  const qualitativeByDept = new Map<string, Array<{ score: number; weight: number }>>();

  for (const d of departments ?? []) {
    ratesByDept.set(d.id, []);
    itemCountByDept.set(d.id, 0);
    scoredCountByDept.set(d.id, 0);
    thresholdByDept.set(d.id, []);
    progressByDept.set(d.id, []);
    qualitativeByDept.set(d.id, []);
  }

  const typedItems = (items ?? []) as KpiItemWithPerformances[];

  for (const item of typedItems) {
    const deptId = item.dept_id;
    if (!deptId || !ratesByDept.has(deptId)) continue;

    itemCountByDept.set(deptId, (itemCountByDept.get(deptId) ?? 0) + 1);

    const rawTargets = item.kpi_targets ?? [];
    const targets = rawTargets.map((t) => t as unknown as Record<string, unknown>).filter((t) => {
      if (!hasYear) return true;
      return (
        toNum(t.year as number | string | null | undefined) ===
        CURRENT_KPI_YEAR
      );
    });
    const list = ratesByDept.get(deptId)!;
    const itemRates = collectApprovedAchievementRatesForItemTargets(
      targets,
      hasTargetHalf
    );
    const rep = representativeAchievementPercentForRates(itemRates);
    if (rep !== null) {
      scoredCountByDept.set(deptId, (scoredCountByDept.get(deptId) ?? 0) + 1);
    }
    // 부서 카드 통합 달성률은 "부서 KPI 전체 항목"을 분모로 계산한다.
    // 승인 실적이 없는 항목은 0%로 간주해 평균에 포함한다.
    list.push(rep ?? 0);

    const indicator = parseKpiIndicatorTypeFromDb((item as unknown as Record<string, unknown>).indicator_type);
    const bmRaw = pickText(item as unknown as Record<string, unknown>, ["bm", "benchmark", "standard"]);
    const weightRaw = Number(
      String((item as unknown as Record<string, unknown>).weight ?? "").trim()
    );
    const w = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
    const score = rep ?? 0;
    const lowerBm = String(bmRaw ?? "").toLowerCase();
    if (lowerBm.includes("일정")) {
      qualitativeByDept.get(deptId)!.push({ score, weight: w });
    } else if (indicator === "ppm") {
      thresholdByDept.get(deptId)!.push({ score, weight: w });
    } else {
      progressByDept.get(deptId)!.push({ score, weight: w });
    }
  }

  function weightedAverage(rows: Array<{ score: number; weight: number }>): number | null {
    if (!rows.length) return null;
    const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
    if (totalWeight <= 0) return null;
    return rows.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight;
  }

  return (departments ?? []).map((d) => {
    const rates = ratesByDept.get(d.id) ?? [];
    const thresholdScore = weightedAverage(thresholdByDept.get(d.id) ?? []);
    const progressScore = weightedAverage(progressByDept.get(d.id) ?? []);
    const qualitativeScore = weightedAverage(qualitativeByDept.get(d.id) ?? []);
    const compositeComponents: Array<{ score: number; weight: number }> = [];
    if (thresholdScore !== null) compositeComponents.push({ score: thresholdScore, weight: 30 });
    if (progressScore !== null) compositeComponents.push({ score: progressScore, weight: 50 });
    if (qualitativeScore !== null) compositeComponents.push({ score: qualitativeScore, weight: 20 });
    const compositeScore = weightedAverage(compositeComponents);
    const averageAchievement = compositeScore ?? (rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : null);
    return {
      id: d.id,
      name: d.name,
      averageAchievement,
      kpiItemCount: itemCountByDept.get(d.id) ?? 0,
      scoredKpiCount: scoredCountByDept.get(d.id) ?? 0,
      thresholdScore,
      progressScore,
      qualitativeScore,
    };
  });
}

export type DepartmentKpiDetailItem = {
  id: string;
  mainTopic: string;
  subTopic: string;
  detailActivity: string;
  bm: string;
  weight: string;
  owner: string;
  halfYearSummary: string;
  challengeTarget: number | null;
  firstHalfRate: number | null;
  secondHalfRate: number | null;
  firstHalfTarget: number | null;
  secondHalfTarget: number | null;
  h1TargetDate: string | null;
  h2TargetDate: string | null;
  periodStartMonth: number | null;
  periodEndMonth: number | null;
  targetDirection: "up" | "down" | "na";
  targetFinalValue: number | null;
  scheduleRaw: string | null;
  /** 일반(%) / PPM / 수량 / 건수 */
  indicatorType: KpiIndicatorType;
  /** ppm·quantity·count일 때 목표값 (`kpi_items.target_value`) */
  targetPpm: number | null;
  /** 목록·부서 평균용 대표 달성률. 월별 입력 시 가장 늦은 월 기준. 없으면 null */
  averageAchievement: number | null;
  targetCount: number;
  /** 반려 사유가 남아 있으면 true — 목록에서 강조 표시 */
  hasRejectionNotice: boolean;
  /** 항목의 현재 승인 상태 (대표값) */
  currentApprovalStep: string | null;
};

type ScoreTrack = "threshold" | "progress" | "qualitative";

export type DashboardSummaryStats = {
  totalKpiCount: number;
  totalScoredKpiCount: number;
  inputRate: number;
  averageAchievement: number;
  pendingPrimaryCount: number;
  pendingFinalCount: number;
};

/**
 * `kpi_targets.approval_step` 기준 — draft(또는 비어 있음)만 일반 작성자가 실적 수정 가능.
 * pending_primary / pending_final / pending / approved 는 잠금.
 */
export function isWriterPerformanceLockedByStep(
  step: string | null | undefined
): boolean {
  const s = (step ?? "").trim().toLowerCase();
  if (!s || s === PERF_STATUS_DRAFT) return false;
  return true;
}

function targetsHaveRejectionReason(targets: Record<string, unknown>[]): boolean {
  return targets.some((t) => {
    const r = t.rejection_reason;
    return typeof r === "string" && r.trim().length > 0;
  });
}

function aggregateApprovalStepForItem(
  targets: Record<string, unknown>[]
): string | null {
  const steps = targets
    .map((t) =>
      typeof t.approval_step === "string" ? t.approval_step.trim().toLowerCase() : ""
    )
    .filter(Boolean);
  if (!steps.length) return null;
  if (steps.includes(PERF_STATUS_APPROVED)) return PERF_STATUS_APPROVED;
  if (steps.includes(PERF_STATUS_PENDING_FINAL)) return PERF_STATUS_PENDING_FINAL;
  if (steps.includes(PERF_STATUS_PENDING_PRIMARY) || steps.includes(PERF_LEGACY_PENDING)) {
    return PERF_STATUS_PENDING_PRIMARY;
  }
  return PERF_STATUS_DRAFT;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function looksLikeHttpUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

function encodePathSegmentSafe(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .filter((seg) => seg.length > 0)
    .map((seg) => encodePathSegmentSafe(seg))
    .join("/");
}

function toBucketRelativePath(rawPath: string): string {
  let p = rawPath.trim().replace(/^\/+/, "");
  p = p.replace(/^storage\/v1\/object\/public\/kpi-evidence\/?/i, "");
  p = p.replace(/^public\/kpi-evidence\/?/i, "");
  p = p.replace(/^kpi-evidence\/?/i, "");
  return p;
}

export function evidencePathFromStoredValue(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (looksLikeHttpUrl(trimmed)) {
    try {
      const u = new URL(trimmed);
      const fromUrl = toBucketRelativePath(u.pathname);
      return fromUrl || null;
    } catch {
      return null;
    }
  }
  const fromRaw = toBucketRelativePath(trimmed);
  return fromRaw || null;
}

export function evidenceFileNameFromStoredValue(
  raw: string | null | undefined
): string {
  const p = evidencePathFromStoredValue(raw);
  if (!p) return "evidence";
  const seg = p.split("/").filter(Boolean).pop() ?? "evidence";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function normalizeHttpUrlPath(urlText: string): string {
  try {
    const u = new URL(urlText);
    const encodedPath = u.pathname
      .split("/")
      .map((seg) => encodePathSegmentSafe(seg))
      .join("/");
    u.pathname = encodedPath;
    return u.toString();
  } catch {
    return urlText;
  }
}

/**
 * kpi_targets.evidence_url 이 전체 URL 또는 버킷 내 경로(path)일 수 있어
 * UI에서 항상 접근 가능한 public URL로 정규화한다.
 */
function toEvidencePublicUrl(
  supabase: ReturnType<typeof createBrowserSupabase>,
  rawUrl: unknown
): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (looksLikeHttpUrl(trimmed)) return normalizeHttpUrlPath(trimmed);
  const normalizedPath = toBucketRelativePath(trimmed);
  if (!normalizedPath) return null;
  const encodedPath = encodeStoragePath(normalizedPath);
  const { data } = supabase.storage
    .from("kpi-evidence")
    .getPublicUrl(encodedPath);
  return data.publicUrl?.trim() ? data.publicUrl : null;
}

/**
 * 클라이언트 어디서든 evidence_url(raw/path/url)을 Public URL로 강제 정규화.
 */
export function resolveEvidencePublicUrl(
  rawUrl: string | null | undefined
): string | null {
  const supabase = createBrowserSupabase();
  return toEvidencePublicUrl(supabase, rawUrl);
}

function pickText(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const value = obj[k];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "-";
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const k of keys) {
    const v = toNum(obj[k] as number | string | null | undefined);
    if (v !== null) return v;
  }
  return null;
}

export async function fetchDepartmentKpiDetail(
  departmentId: string
): Promise<{
  department: { id: string; name: string } | null;
  departmentAverageAchievement: number | null;
  thresholdScore: number | null;
  progressScore: number | null;
  qualitativeScore: number | null;
  compositeScore: number | null;
  items: DepartmentKpiDetailItem[];
}> {
  const supabase = createBrowserSupabase();
  const hasYear = await getKpiTargetsHasYearColumn();
  const hasTargetHalf = await getKpiTargetsHasHalfTypeColumn();
  const hasH1TargetPctColumn = await getKpiTargetsHasColumn("h1_target_pct");
  const hasH2TargetPctColumn = await getKpiTargetsHasColumn("h2_target_pct");

  const { data: dept, error: deptErr } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", departmentId)
    .maybeSingle();

  if (deptErr) {
    return {
      department: null,
      departmentAverageAchievement: null,
      thresholdScore: null,
      progressScore: null,
      qualitativeScore: null,
      compositeScore: null,
      items: [],
    };
  }

  const { data: items, error: itemErr } = await supabase
    .from("kpi_items")
    .select("*, kpi_targets(*)")
    .eq("dept_id", departmentId);

  if (itemErr) {
    return {
      department: dept ? { id: dept.id, name: dept.name } : null,
      departmentAverageAchievement: null,
      thresholdScore: null,
      progressScore: null,
      qualitativeScore: null,
      compositeScore: null,
      items: [],
    };
  }

  const typedItems = (items ?? []) as Record<string, unknown>[];
  const departmentRates: number[] = [];
  const thresholdWeighted: Array<{ score: number; weight: number }> = [];
  const progressWeighted: Array<{ score: number; weight: number }> = [];
  const qualitativeWeighted: Array<{ score: number; weight: number }> = [];

  function resolveScoreTrack(
    indicatorType: KpiIndicatorType,
    bmText: string | null | undefined
  ): ScoreTrack {
    const bm = String(bmText ?? "").toLowerCase();
    if (bm.includes("일정")) return "qualitative";
    if (indicatorType === "ppm") return "threshold";
    return "progress";
  }

  function pushWeightedScore(track: ScoreTrack, score: number | null, weightRaw: string) {
    if (score === null || !Number.isFinite(score)) return;
    const w = Number(String(weightRaw ?? "").trim());
    const weight = Number.isFinite(w) && w > 0 ? w : 1;
    if (track === "threshold") thresholdWeighted.push({ score, weight });
    else if (track === "qualitative") qualitativeWeighted.push({ score, weight });
    else progressWeighted.push({ score, weight });
  }

  function weightedAverage(rows: Array<{ score: number; weight: number }>): number | null {
    if (!rows.length) return null;
    const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
    if (totalWeight <= 0) return null;
    const total = rows.reduce((s, r) => s + r.score * r.weight, 0);
    return total / totalWeight;
  }

  const detailItems: DepartmentKpiDetailItem[] = typedItems.map((raw) => {
    const item = asRecord(raw);
    const rawTargets = Array.isArray(item.kpi_targets) ? item.kpi_targets : [];
    const targets = rawTargets.map(asRecord).filter((t) => {
      if (!hasYear) return true;
      return (
        toNum(t.year as number | string | null | undefined) ===
        CURRENT_KPI_YEAR
      );
    });
    const rates = collectApprovedAchievementRatesForItemTargets(
      targets,
      hasTargetHalf
    );
    const averageAchievement =
      representativeAchievementPercentForRates(rates);
    // 부서 상단 "전체 평균 달성률"은 대시보드 부서 카드와 동일하게
    // 등록된 KPI 항목 수를 분모로 하고, 승인 실적 없음은 0%로 포함한다.
    departmentRates.push(averageAchievement ?? 0);

    const firstHalf = targets
      .map((t) => pickText(t, ["h1_target"]))
      .filter((v) => v !== "-")
      .join(", ");
    const secondHalf = targets
      .map((t) => pickText(t, ["h2_target"]))
      .filter((v) => v !== "-")
      .join(", ");
    const fallbackSummary = pickText(item, [
      "target_summary",
      "half_year_summary",
      "goal_summary",
    ]);
    const halfYearSummary =
      firstHalf || secondHalf
        ? `상반기 일정: ${firstHalf || "-"} / 하반기 일정: ${secondHalf || "-"}`
        : fallbackSummary;
    const challengeTarget = pickNumber(item, [
      "challenge_goal",
      "target_rate",
      "goal_rate",
    ]);
    const primaryTarget = targets.find((t) => {
      const half = normalizeHalfTypeKey(String(t.half_type ?? ""));
      return half === HALF_TYPE_H1;
    }) ?? targets[0] ?? {};
    const h1TargetDateRaw = pickText(primaryTarget, [
      "h1_target",
      "first_half_target",
      "target_h1",
      "first_half",
    ]);
    const h2TargetDateRaw = pickText(primaryTarget, [
      "h2_target",
      "second_half_target",
      "target_h2",
      "second_half",
    ]);
    const h1TargetDate = h1TargetDateRaw === "-" ? null : h1TargetDateRaw;
    const h2TargetDate = h2TargetDateRaw === "-" ? null : h2TargetDateRaw;
    const targetRows = targets;
    const firstDraftRow = targetRows.find(
      (t) => String(t.approval_step ?? "").trim().toLowerCase() === PERF_STATUS_DRAFT
    );
    const firstHalfTargetFromPct = targetRows
      .map((t) => pickNumber(t, ["h1_target_pct", "h1_target_value"]))
      .find((v) => v !== null) ?? null;
    const secondHalfTargetFromPct = targetRows
      .map((t) => pickNumber(t, ["h2_target_pct", "h2_target_value"]))
      .find((v) => v !== null) ?? null;
    /** 목표(Target) 점선 전용 — 실적은 h1_result/h1_rate(2Q) 등과 분리 */
    const firstHalfTarget = hasH1TargetPctColumn
      ? firstHalfTargetFromPct
      : pickNumber(firstDraftRow ?? {}, ["h1_rate"]);
    const secondHalfTarget = hasH2TargetPctColumn
      ? secondHalfTargetFromPct
      : pickNumber(firstDraftRow ?? {}, ["h2_rate"]);
    const firstHalfRate = firstHalfTarget;
    const secondHalfRate = secondHalfTarget;
    const scheduleRaw =
      typeof item.schedule === "string"
        ? item.schedule
        : item.schedule
          ? JSON.stringify(item.schedule)
          : null;

    const itemIdText =
      typeof item.id === "string" && item.id.length > 0
        ? item.id.slice(0, 8)
        : "unknown";
    const indicatorType = parseKpiIndicatorTypeFromDb(item.indicator_type);
    const targetPpm = pickNumber(item, ["target_value", "target_ppm"]);
    const periodStartMonth = pickNumber(item, ["period_start_month"]);
    const periodEndMonth = pickNumber(item, ["period_end_month"]);
    const targetFinalValue = pickNumber(item, ["target_final_value"]);
    const directionRaw = String(item.target_direction ?? "").trim().toLowerCase();
    const targetDirection: "up" | "down" | "na" =
      directionRaw === "down" ? "down" : directionRaw === "na" ? "na" : "up";
    const bm = pickText(item, ["bm", "base_measure", "benchmark"]);
    const weightText = pickText(item, ["weight", "weight_rate", "weighted_score"]);
    const track = resolveScoreTrack(indicatorType, bm);
    pushWeightedScore(track, averageAchievement, weightText);

    return {
      id: typeof item.id === "string" ? item.id : `kpi-${itemIdText}`,
      mainTopic: pickText(item, ["main_topic", "topic_main"]),
      subTopic: pickText(item, ["sub_topic", "topic_sub", "sub_title", "subtitle"]),
      detailActivity: pickText(item, ["detail_activity"]),
      bm,
      weight: weightText,
      owner: pickText(item, [
        "manager_name",
        "owner",
        "assignee",
        "manager",
        "owner_name",
      ]),
      halfYearSummary,
      challengeTarget,
      firstHalfRate,
      secondHalfRate,
      firstHalfTarget,
      secondHalfTarget,
      h1TargetDate,
      h2TargetDate,
      periodStartMonth,
      periodEndMonth,
      targetDirection,
      targetFinalValue,
      scheduleRaw,
      indicatorType,
      targetPpm,
      averageAchievement,
      targetCount: targets.length,
      hasRejectionNotice: targetsHaveRejectionReason(targets),
      currentApprovalStep: aggregateApprovalStepForItem(targets),
    };
  });

  const departmentAverageAchievement =
    departmentRates.length > 0
      ? departmentRates.reduce((a, b) => a + b, 0) / departmentRates.length
      : null;
  const thresholdScore = weightedAverage(thresholdWeighted);
  const progressScore = weightedAverage(progressWeighted);
  const qualitativeScore = weightedAverage(qualitativeWeighted);
  const compositeComponents: Array<{ score: number; weight: number }> = [];
  if (thresholdScore !== null) compositeComponents.push({ score: thresholdScore, weight: 30 });
  if (progressScore !== null) compositeComponents.push({ score: progressScore, weight: 50 });
  if (qualitativeScore !== null) compositeComponents.push({ score: qualitativeScore, weight: 20 });
  const compositeScore = weightedAverage(compositeComponents);

  return {
    department: dept ? { id: dept.id, name: dept.name } : null,
    departmentAverageAchievement,
    thresholdScore,
    progressScore,
    qualitativeScore,
    compositeScore,
    items: detailItems,
  };
}

export async function fetchDashboardSummaryStats(
  filterDeptId?: string | null
): Promise<DashboardSummaryStats> {
  const supabase = createBrowserSupabase();
  const hasYear = await getKpiTargetsHasYearColumn();

  let q = supabase.from("kpi_targets").select("*, kpi_items(dept_id)");
  if (hasYear) q = q.eq("year", CURRENT_KPI_YEAR);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const scoped = (data ?? []).filter((row) => {
    if (!filterDeptId) return true;
    const rec = asRecord(row as unknown as Record<string, unknown>);
    const itemRaw = rec.kpi_items;
    const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw;
    const deptId = item && typeof (item as Record<string, unknown>).dept_id === "string"
      ? (item as Record<string, unknown>).dept_id
      : null;
    return deptId === filterDeptId;
  });

  let pendingPrimaryCount = 0;
  let pendingFinalCount = 0;

  for (const row of scoped) {
    const rec = asRecord(row as unknown as Record<string, unknown>);
    const pmRaw = rec.performance_monthly;
    if (performanceMonthlyIsNonEmpty(pmRaw)) {
      const o = pmRaw as Record<string, unknown>;
      for (const mi of KPI_MONTHS) {
        const cell = o[String(mi)];
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
        const c = cell as PerformanceMonthlyCell;
        const st =
          typeof c.approval_step === "string"
            ? c.approval_step.trim().toLowerCase()
            : "";
        if (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING) {
          pendingPrimaryCount += 1;
        } else if (st === PERF_STATUS_PENDING_FINAL) {
          pendingFinalCount += 1;
        }
      }
    } else {
      const step =
        typeof rec.approval_step === "string"
          ? rec.approval_step.trim().toLowerCase()
          : "";
      if (step === PERF_STATUS_PENDING_PRIMARY || step === PERF_LEGACY_PENDING) {
        pendingPrimaryCount += 1;
      } else if (step === PERF_STATUS_PENDING_FINAL) {
        pendingFinalCount += 1;
      }
    }
  }

  // 상단 "전체 평균 달성률"은 KPI 항목 단위가 아니라
  // "부서별 통합 달성률(카드 값)"들의 평균으로 계산한다.
  const deptSummaries = await fetchDepartmentKpiSummary();
  const scopedDeptSummaries = (filterDeptId
    ? deptSummaries.filter((d) => d.id === filterDeptId)
    : deptSummaries
  ).filter((d) => d.kpiItemCount > 0);
  const averageAchievement =
    scopedDeptSummaries.length > 0
      ? scopedDeptSummaries.reduce(
          (acc, d) => acc + (d.averageAchievement ?? 0),
          0
        ) / scopedDeptSummaries.length
      : 0;
  const totalKpiCount = scopedDeptSummaries.reduce(
    (acc, d) => acc + (d.kpiItemCount ?? 0),
    0
  );
  const totalScoredKpiCount = scopedDeptSummaries.reduce(
    (acc, d) => acc + (d.scoredKpiCount ?? 0),
    0
  );
  const inputRate =
    totalKpiCount > 0 ? (totalScoredKpiCount / totalKpiCount) * 100 : 0;

  return {
    totalKpiCount,
    totalScoredKpiCount,
    inputRate,
    averageAchievement,
    pendingPrimaryCount,
    pendingFinalCount,
  };
}

export type ItemPerformanceRow = {
  /** `kpi_targets.id` */
  id: string;
  half_type: string;
  achievement_rate: number | null;
  /** ppm·수량·건수 등: 월별 실적 원값 (`performance_monthly.*.actual_value`) */
  actual_value: number | null;
  approval_step: string | null;
  evidence_path: string | null;
  evidence_url: string | null;
  description: string | null;
  rejection_reason: string | null;
};

function monthFromTargetText(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/(\d{1,2})\s*[\/.\-월]/);
  if (!m?.[1]) return null;
  const month = Number(m[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

function legacyQuarterLabelFromMonth(month: number): QuarterLabel {
  if (month <= 3) return "26Y 1Q";
  if (month <= 6) return "26Y 2Q";
  if (month <= 9) return "26Y 3Q";
  return "26Y 4Q";
}

function deriveLegacyQuarterFromTargetRecord(
  t: Record<string, unknown>
): QuarterLabel | null {
  const half = normalizeHalfTypeKey(String(t.half_type ?? ""));
  const h1Month = monthFromTargetText(t.h1_target);
  const h2Month = monthFromTargetText(t.h2_target);
  if (half === HALF_TYPE_H1) {
    if (h1Month !== null) return legacyQuarterLabelFromMonth(h1Month);
    return "26Y 1Q";
  }
  if (half === HALF_TYPE_H2) {
    if (h2Month !== null) return legacyQuarterLabelFromMonth(h2Month);
    return "26Y 3Q";
  }
  if (h1Month !== null) return legacyQuarterLabelFromMonth(h1Month);
  if (h2Month !== null) return legacyQuarterLabelFromMonth(h2Month);
  return null;
}

function legacyQuarterRangeFromTargetRecord(
  t: Record<string, unknown>
): QuarterLabel[] {
  const half = normalizeHalfTypeKey(String(t.half_type ?? ""));
  const h1Month = monthFromTargetText(t.h1_target);
  const h2Month = monthFromTargetText(t.h2_target);

  if (half === HALF_TYPE_H1) {
    const endQuarter = h1Month !== null ? Math.min(2, Math.max(1, Math.ceil(h1Month / 3))) : 2;
    const out: QuarterLabel[] = [];
    for (let qn = 1; qn <= endQuarter; qn += 1) {
      out.push(`26Y ${qn}Q` as QuarterLabel);
    }
    return out;
  }

  if (half === HALF_TYPE_H2) {
    const endQuarter = h2Month !== null ? Math.min(4, Math.max(3, Math.ceil(h2Month / 3))) : 4;
    const out: QuarterLabel[] = [];
    const startQuarter = h1Month === null ? 1 : 3;
    for (let qn = startQuarter; qn <= endQuarter; qn += 1) {
      out.push(`26Y ${qn}Q` as QuarterLabel);
    }
    return out;
  }

  const q = deriveLegacyQuarterFromTargetRecord(t);
  return q ? [q] : [];
}

function legacyQuarterRangeLabelFromTargetRecord(
  t: Record<string, unknown>
): string | null {
  const qs = legacyQuarterRangeFromTargetRecord(t);
  if (!qs.length) return null;
  if (qs.length === 1) return qs[0]!;
  return `${qs[0]} ~ ${qs[qs.length - 1]}`;
}

/** 승인 대기 목록: `h1_target`/`h2_target` 일정 → `3월~10월` (분기 라벨 대신) */
function formatKpiTargetActiveMonthRangeLabel(
  t: Record<string, unknown>
): string | null {
  const h1Raw = pickText(t, ["h1_target"]);
  const h2Raw = pickText(t, ["h2_target"]);
  const h1 = h1Raw !== "-" ? h1Raw : null;
  const h2 = h2Raw !== "-" ? h2Raw : null;
  const sched = scheduleMonthsFromItemDates(h1, h2);
  const months = activeMonthsForSchedule(sched);
  if (months.length === 0) return null;
  const first = months[0]!;
  const last = months[months.length - 1]!;
  if (first === last) return `${first}월`;
  return `${first}월~${last}월`;
}

function quarterAchievementPercentFromTarget(
  t: Record<string, unknown>,
  quarter: QuarterLabel
): number | null {
  const step =
    typeof t.approval_step === "string"
      ? t.approval_step.trim().toLowerCase()
      : "";
  // draft(제출 전)에서는 목표 컬럼값이 실적으로 보이지 않도록 차단
  if (!step || step === PERF_STATUS_DRAFT) {
    return null;
  }
  if (quarter === "26Y 1Q") {
    const v = toNum(t.h1_result as number | string | null | undefined);
    return v === null ? null : clampPercent100(v);
  }
  if (quarter === "26Y 2Q") {
    const v = toNum(t.h1_rate as number | string | null | undefined);
    if (v === null) return null;
    const targetPct = toNum(
      t.h1_target_pct as number | string | null | undefined
    );
    const q1 = toNum(t.h1_result as number | string | null | undefined);
    if (
      targetPct !== null &&
      q1 === null &&
      pctRoughlyEqual(v, targetPct)
    ) {
      return null;
    }
    return clampPercent100(v);
  }
  if (quarter === "26Y 3Q") {
    const v = toNum(t.h2_result as number | string | null | undefined);
    return v === null ? null : clampPercent100(v);
  }
  const v = toNum(t.h2_rate as number | string | null | undefined);
  if (v === null) return null;
  const targetPct = toNum(
    t.h2_target_pct as number | string | null | undefined
  );
  const q3 = toNum(t.h2_result as number | string | null | undefined);
  if (
    targetPct !== null &&
    q3 === null &&
    pctRoughlyEqual(v, targetPct)
  ) {
    return null;
  }
  return clampPercent100(v);
}

function mapTargetRecordToQuarterRows(t: Record<string, unknown>): ItemPerformanceRow[] {
  const base = mapTargetRecordToItemPerformanceRow(t);
  const quarters = legacyQuarterRangeFromTargetRecord(t);
  const rr = typeof t.rejection_reason === "string" && t.rejection_reason.trim()
    ? t.rejection_reason.trim()
    : null;
  if (!quarters.length) return [];
  return quarters.map((q) => ({
    ...base,
    half_type: q,
    achievement_rate: quarterAchievementPercentFromTarget(t, q),
    rejection_reason: rr,
  }));
}

async function fetchKpiTargetsApprovalRowsForItem(
  supabase: ReturnType<typeof createBrowserSupabase>,
  kpiId: string
): Promise<Record<string, unknown>[]> {
  const hasYear = await getKpiTargetsHasYearColumn();
  let tq = supabase.from("kpi_targets").select("*").eq("kpi_id", kpiId);
  if (hasYear) tq = tq.eq("year", CURRENT_KPI_YEAR);
  const { data, error } = await tq;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) =>
    asRecord(r as unknown as Record<string, unknown>)
  );
}

function mapTargetRecordToItemPerformanceRow(
  t: Record<string, unknown>,
  halfTypeOverride?: string
): ItemPerformanceRow {
  const supabase = createBrowserSupabase();
  const id = typeof t.id === "string" ? t.id : String(t.id ?? "");
  const ht =
    halfTypeOverride ??
    (normalizeHalfTypeKey(String(t.half_type ?? "")) || HALF_TYPE_H1);
  const canonical =
    normalizeHalfTypeKey(halfTypeOverride ?? ht) === HALF_TYPE_H2
      ? HALF_TYPE_H2
      : HALF_TYPE_H1;
  const rr = t.rejection_reason;
  const remarks =
    typeof t.remarks === "string" ? t.remarks : null;
  return {
    id,
    half_type: ht,
    achievement_rate: halfYearAchievementPercentFromTarget(t, canonical),
    actual_value: null,
    approval_step:
      typeof t.approval_step === "string" ? t.approval_step : null,
    evidence_path:
      typeof t.evidence_url === "string" && t.evidence_url.trim()
        ? t.evidence_url.trim()
        : null,
    evidence_url: toEvidencePublicUrl(supabase, t.evidence_url),
    description: remarks,
    rejection_reason:
      typeof rr === "string" && rr.trim() ? rr.trim() : null,
  };
}

/**
 * 레거시 DB(분기 컬럼만 있음)를 월 축에 올릴 때, 1Q 값이 1·2·3월에 똑같이 복제되지 않도록
 * 분기당 대표 월(1·4·7·10)에만 달성률을 붙인다. (`performance_monthly` 사용 시에는 월마다 별도.)
 */
function isLegacyQuarterAnchorMonth(m: MonthKey): boolean {
  return ((m - 1) % 3) === 0;
}

async function buildItemPerformanceRowsFromKpiTargets(
  targetRows: Record<string, unknown>[],
  hasTargetHalf: boolean,
  supabase: ReturnType<typeof createBrowserSupabase>
): Promise<ItemPerformanceRow[]> {
  if (!targetRows.length) return [];

  if (!hasTargetHalf) {
    const t0 = targetRows[0]!;
    return KPI_MONTHS.map((m) => {
      const q = monthToLegacyQuarter(m) as QuarterLabel;
      return {
        ...mapTargetRecordToItemPerformanceRow(t0),
        half_type: monthToHalfTypeLabel(m),
        achievement_rate: isLegacyQuarterAnchorMonth(m)
          ? quarterAchievementPercentFromTarget(t0, q)
          : null,
        actual_value: null,
      };
    });
  }

  const h1Row =
    targetRows.find(
      (r) => String(r.half_type ?? "").trim().toUpperCase() === HALF_TYPE_H1
    ) ?? targetRows[0]!;
  const h2Row =
    targetRows.find(
      (r) => String(r.half_type ?? "").trim().toUpperCase() === HALF_TYPE_H2
    ) ?? null;

  const hasMonthlyCol = await getKpiTargetsHasPerformanceMonthlyColumn();
  const pmRaw = h1Row.performance_monthly;
  /** 컬럼만 있으면 월별 JSON으로 읽음(빈 {} 도 레거시 분기로 떨어지면 1·2·3월이 h1_result 하나를 공유해 덮어씀) */
  const useJson = hasMonthlyCol;

  if (useJson) {
    const id = typeof h1Row.id === "string" ? h1Row.id : String(h1Row.id ?? "");
    const o =
      pmRaw !== null &&
      pmRaw !== undefined &&
      typeof pmRaw === "object" &&
      !Array.isArray(pmRaw)
        ? (pmRaw as Record<string, unknown>)
        : {};
    return KPI_MONTHS.map((m) => {
      const cell = o[String(m)] as PerformanceMonthlyCell | undefined;
      const st = cell?.approval_step ?? PERF_STATUS_DRAFT;
      const rateRaw = cell?.achievement_rate;
      const rate =
        rateRaw !== null && rateRaw !== undefined
          ? toNum(rateRaw as number | string)
          : null;
      const avRaw = cell?.actual_value;
      const actualVal =
        avRaw !== null && avRaw !== undefined
          ? toNum(avRaw as number | string)
          : null;
      const ev = cell?.evidence_url;
      return {
        id,
        half_type: monthToHalfTypeLabel(m),
        achievement_rate: rate,
        actual_value: actualVal,
        approval_step: typeof st === "string" ? st : null,
        evidence_path:
          typeof ev === "string" && ev.trim() ? ev.trim() : null,
        evidence_url: toEvidencePublicUrl(supabase, ev),
        description:
          typeof cell?.remarks === "string" ? cell.remarks : null,
        rejection_reason:
          typeof cell?.rejection_reason === "string" &&
          cell.rejection_reason.trim()
            ? cell.rejection_reason.trim()
            : null,
      };
    });
  }

  const h1s = h1Row;
  const h2s = h2Row ?? {};
  return KPI_MONTHS.map((m) => {
    const src = m <= 6 ? h1s : h2s;
    const q = monthToLegacyQuarter(m) as QuarterLabel;
    const rowId =
      m <= 6
        ? typeof h1Row.id === "string"
          ? h1Row.id
          : String(h1Row.id ?? "")
        : h2Row && typeof h2Row.id === "string"
          ? h2Row.id
          : typeof h1Row.id === "string"
            ? h1Row.id
            : String(h1Row.id ?? "");
    const rr = src.rejection_reason;
    return {
      id: rowId,
      half_type: monthToHalfTypeLabel(m),
      achievement_rate: isLegacyQuarterAnchorMonth(m)
        ? quarterAchievementPercentFromTarget(src, q)
        : null,
      actual_value: null,
      approval_step:
        typeof src.approval_step === "string" ? src.approval_step : null,
      evidence_path:
        typeof src.evidence_url === "string" && src.evidence_url.trim()
          ? src.evidence_url.trim()
          : null,
      evidence_url: toEvidencePublicUrl(supabase, src.evidence_url),
      description:
        typeof src.remarks === "string" ? src.remarks : null,
      rejection_reason:
        typeof rr === "string" && rr.trim() ? rr.trim() : null,
    };
  });
}

export async function fetchKpiPerformancesByItem(
  kpiId: string
): Promise<ItemPerformanceRow[]> {
  const supabase = createBrowserSupabase();
  const hasTargetHalf = await getKpiTargetsHasHalfTypeColumn();
  const targetRows = await fetchKpiTargetsApprovalRowsForItem(supabase, kpiId);
  return buildItemPerformanceRowsFromKpiTargets(
    targetRows,
    hasTargetHalf,
    supabase
  );
}

/** 엑셀 등으로 만든 연도별 목표 행 1건 (kpi_id + year) */
async function findKpiTargetRowIdForYear(
  supabase: ReturnType<typeof createBrowserSupabase>,
  kpiId: string,
  halfTypeValue?: string
): Promise<string | null> {
  const hasYear = await getKpiTargetsHasYearColumn();
  const hasHalfType = await getKpiTargetsHasHalfTypeColumn();
  let q = supabase
    .from("kpi_targets")
    .select("id")
    .eq("kpi_id", kpiId)
    .order("id", { ascending: true })
    .limit(1);
  if (hasYear) q = q.eq("year", CURRENT_KPI_YEAR);
  if (hasHalfType && halfTypeValue?.trim()) {
    q = q.eq("half_type", halfTypeValue.trim());
  }
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  const id = data && typeof (data as { id?: unknown }).id === "string"
    ? (data as { id: string }).id
    : null;
  return id;
}

async function findOrCreateKpiTargetRowIdForYear(
  supabase: ReturnType<typeof createBrowserSupabase>,
  kpiId: string,
  halfTypeValue?: string
): Promise<string> {
  const existingId = await findKpiTargetRowIdForYear(
    supabase,
    kpiId,
    halfTypeValue
  );
  if (existingId) return existingId;

  const hasYear = await getKpiTargetsHasYearColumn();
  const hasHalfType = await getKpiTargetsHasHalfTypeColumn();
  const createPayload: Record<string, unknown> = {
    kpi_id: kpiId,
    approval_step: PERF_STATUS_DRAFT,
    rejection_reason: null,
    remarks: null,
  };
  if (hasYear) createPayload.year = CURRENT_KPI_YEAR;
  if (hasHalfType) {
    createPayload.half_type = halfTypeValue?.trim() || HALF_TYPE_H1;
  }

  const filtered = await filterPayloadToExistingKpiTargetColumns(createPayload);
  const { data, error } = await supabase
    .from("kpi_targets")
    .insert(filtered)
    .select("id")
    .single();
  if (error) {
    throw new Error(
      `실적 정보 생성 중 오류가 발생했습니다: ${error.message}. 잠시 후 다시 시도해 주세요.`
    );
  }
  const newId =
    data && typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : null;
  if (newId) return newId;

  // 안전장치: insert 응답에 id가 비어 있으면 다시 조회해서 복구
  const retryId = await findKpiTargetRowIdForYear(
    supabase,
    kpiId,
    halfTypeValue
  );
  if (retryId) return retryId;
  throw new Error(
    "실적 정보 생성 중 ID를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

export async function uploadEvidenceFile(
  targetId: string,
  file: File,
  quarterSegment?: string
): Promise<{ fullPath: string; publicUrl: string }> {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error(
      "로그인 세션이 확인되지 않아 파일 업로드를 진행할 수 없습니다. 다시 로그인해 주세요."
    );
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "dat";
  const safeExt = (ext ?? "dat")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10) || "dat";
  const baseName = file.name.replace(/\.[^/.]+$/, "").trim();
  const safeBaseName = (baseName || "evidence")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "evidence";
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  const safeTargetId = targetId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeTargetId) {
    throw new Error("실적 정보 생성 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const safeQuarter =
    quarterSegment
      ?.normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "") || "q";
  const preferredPath = `kpi/${safeTargetId}/${safeQuarter}_${timestamp}_${safeBaseName}.${safeExt}`;
  const fallbackPath = `kpi/${safeTargetId}/${safeQuarter}_${timestamp}_${nonce}.${safeExt}`;

  const tryUpload = async (path: string) => {
    const { error } = await supabase.storage
      .from("kpi-evidence")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
    return { path, error };
  };

  let uploaded = await tryUpload(preferredPath);
  if (uploaded.error && /failed to fetch/i.test(uploaded.error.message)) {
    // 네트워크/인코딩 이슈를 줄이기 위한 1회 재시도 (짧은 파일명)
    uploaded = await tryUpload(fallbackPath);
  }
  if (uploaded.error) {
    throw new Error(
      `증빙 파일 업로드 실패: ${uploaded.error.message} (네트워크·Storage 정책·버킷 권한을 확인해 주세요.)`
    );
  }

  const { data } = supabase.storage
    .from("kpi-evidence")
    .getPublicUrl(uploaded.path);
  if (!data.publicUrl) throw new Error("증빙 파일 URL 생성에 실패했습니다.");
  return { fullPath: uploaded.path, publicUrl: data.publicUrl };
}

/**
 * 분기별 실적 저장: kpi_id + year 일치하는 기존 kpi_targets 행만 UPDATE.
 * 상반기(1·2Q) → h1_result·h1_rate, 하반기(3·4Q) → h2_result·h2_rate, 특이사항 → remarks.
 * @param evidenceUrl 생략(undefined) 시 evidence_url 컬럼은 건드리지 않음
 */
export async function upsertQuarterPerformance(
  input: {
    kpiId: string;
    quarter: QuarterLabel;
    achievement_rate: number;
    description: string;
    evidenceUrl?: string | null;
  },
  options?: {
    /** 관리자만 — 어떤 approval_step이어도 kpi_targets 갱신 허용 */
    adminBypassApprovalLock?: boolean;
    /** 저장 수행자 role(한글/영문) — 그룹장/팀장/관리자 수정 허용 */
    actorRole?: string | null;
  }
): Promise<{ targetId: string }> {
  const supabase = createBrowserSupabase();
  const halfCanon = quarterLabelToHalfTypeCanonical(input.quarter);
  const hasHalfType = await getKpiTargetsHasHalfTypeColumn();
  const targetId = await findOrCreateKpiTargetRowIdForYear(
    supabase,
    input.kpiId,
    hasHalfType ? halfCanon : undefined
  );

  const { data: cur, error: selErr } = await supabase
    .from("kpi_targets")
    .select("approval_step")
    .eq("id", targetId)
    .maybeSingle();
  if (selErr) {
    throw new Error(
      `kpi_targets 조회 실패: ${selErr.message} (연결·RLS·컬럼을 확인해 주세요.)`
    );
  }
  const curRec = cur as Record<string, unknown> | null;
  const stepRaw =
    curRec && typeof curRec.approval_step === "string"
      ? curRec.approval_step
      : "";
  const st = stepRaw.trim().toLowerCase();
  const actor = normalizeRole(options?.actorRole);
  const privilegedEditor =
    actor === "admin" || actor === "group_leader" || actor === "team_leader";
  if (!options?.adminBypassApprovalLock && !privilegedEditor) {
    if (st === PERF_STATUS_APPROVED) {
      throw new Error(
        "승인 완료(approved) 실적은 그룹장·팀장·관리자만 수정할 수 있습니다."
      );
    }
  }

  const r = clampPercent100(input.achievement_rate);
  const updatePayload: Record<string, unknown> = {
    approval_step: approvalStepAfterPerformanceSubmit(options?.actorRole),
    rejection_reason: null,
    remarks: input.description.trim() || null,
  };
  if (input.quarter === "26Y 1Q") {
    updatePayload.h1_result = r;
  } else if (input.quarter === "26Y 2Q") {
    updatePayload.h1_rate = r;
  } else if (input.quarter === "26Y 3Q") {
    updatePayload.h2_result = r;
  } else {
    updatePayload.h2_rate = r;
  }
  if (input.evidenceUrl !== undefined) {
    updatePayload.evidence_url = input.evidenceUrl;
  }

  const hasYear = await getKpiTargetsHasYearColumn();
  const upsertPayloadBase: Record<string, unknown> = {
    id: targetId,
    kpi_id: input.kpiId,
    ...updatePayload,
  };
  if (hasYear) upsertPayloadBase.year = CURRENT_KPI_YEAR;
  if (hasHalfType) upsertPayloadBase.half_type = halfCanon;

  const filtered = await filterPayloadToExistingKpiTargetColumns(upsertPayloadBase);
  if (Object.keys(filtered).length === 0) {
    throw new Error(
      "kpi_targets에 쓸 수 있는 컬럼이 없습니다. DB 스키마(h1_result, remarks 등)를 확인해 주세요."
    );
  }

  const { data: savedRow, error } = await supabase
    .from("kpi_targets")
    .upsert(filtered)
    .select("id, kpi_id, year")
    .single();
  if (error) {
    throw new Error(
      `kpi_targets 실적 저장 실패: ${error.message} (컬럼·RLS·network를 확인해 주세요.)`
    );
  }

  const savedId =
    savedRow && typeof (savedRow as { id?: unknown }).id === "string"
      ? (savedRow as { id: string }).id
      : null;
  if (savedId) return { targetId: savedId };

  // Fallback: upsert 성공 후 select()에서 id를 못 받은 경우 재조회
  const fallbackId = await findKpiTargetRowIdForYear(
    supabase,
    input.kpiId,
    hasHalfType ? halfCanon : undefined
  );
  if (fallbackId) return { targetId: fallbackId };
  throw new Error(
    "실적 저장은 완료되었지만 ID를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

/**
 * 월별 실적 저장. `performance_monthly` 컬럼이 없으면 레거시 분기 컬럼으로 폴백합니다.
 */
export async function upsertMonthPerformance(
  input: {
    kpiId: string;
    month: MonthKey;
    achievement_rate: number;
    description: string;
    evidenceUrl?: string | null;
    /**
     * `normal`: 달성률만. 그 외: 공식으로 산출한 달성률 + `actual_value`에 실적 원값.
     * ppm은 달성률 상한 없음(0 이상), quantity·count는 0~100.
     */
    indicatorMode?: KpiIndicatorType;
    actualValue?: number | null;
  },
  options?: {
    adminBypassApprovalLock?: boolean;
    actorRole?: string | null;
  }
): Promise<{ targetId: string }> {
  const supabase = createBrowserSupabase();
  const hasHalfType = await getKpiTargetsHasHalfTypeColumn();
  const targetId = await findOrCreateKpiTargetRowIdForYear(
    supabase,
    input.kpiId,
    hasHalfType ? HALF_TYPE_H1 : undefined
  );

  const { data: cur, error: selErr } = await supabase
    .from("kpi_targets")
    .select("performance_monthly")
    .eq("id", targetId)
    .maybeSingle();
  if (selErr) {
    const msg = selErr.message.toLowerCase();
    if (
      /performance_monthly|schema cache|column|could not find/i.test(msg)
    ) {
      return upsertQuarterPerformance(
        {
          kpiId: input.kpiId,
          quarter: monthToLegacyQuarter(input.month) as QuarterLabel,
          achievement_rate: input.achievement_rate,
          description: input.description,
          evidenceUrl: input.evidenceUrl,
        },
        options
      );
    }
    throw new Error(
      `kpi_targets 조회 실패: ${selErr.message} (연결·RLS·컬럼을 확인해 주세요.)`
    );
  }
  kpiTargetsColumnExistsCache.set("performance_monthly", true);
  const curRec = cur as Record<string, unknown> | null;
  const pm: Record<string, PerformanceMonthlyCell> = {};
  const prevPm = curRec?.performance_monthly;
  if (prevPm && typeof prevPm === "object" && !Array.isArray(prevPm)) {
    const o = prevPm as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const cell = o[k];
      if (cell && typeof cell === "object" && !Array.isArray(cell)) {
        pm[k] = { ...(cell as PerformanceMonthlyCell) };
      }
    }
  }

  const key = String(input.month);
  const prevCell = pm[key] ?? {};
  const prevStep =
    typeof prevCell.approval_step === "string"
      ? prevCell.approval_step.trim().toLowerCase()
      : "";
  const actor = normalizeRole(options?.actorRole);
  const privilegedEditor =
    actor === "admin" || actor === "group_leader" || actor === "team_leader";
  if (!options?.adminBypassApprovalLock && !privilegedEditor) {
    if (prevStep === PERF_STATUS_APPROVED) {
      throw new Error(
        "승인 완료(approved) 실적은 그룹장·팀장·관리자만 수정할 수 있습니다."
      );
    }
  }

  const mode: KpiIndicatorType = input.indicatorMode ?? "normal";
  const r =
    mode === "ppm"
      ? Math.max(0, input.achievement_rate)
      : clampPercent100(input.achievement_rate);
  const nextCell: PerformanceMonthlyCell = {
    ...prevCell,
    achievement_rate: r,
    approval_step: approvalStepAfterPerformanceSubmit(options?.actorRole),
    rejection_reason: null,
    remarks: input.description.trim() || null,
  };
  if (indicatorUsesComputedAchievement(mode)) {
    if (
      input.actualValue !== null &&
      input.actualValue !== undefined &&
      Number.isFinite(input.actualValue)
    ) {
      nextCell.actual_value = input.actualValue;
    }
  } else {
    delete nextCell.actual_value;
  }
  if (input.evidenceUrl !== undefined) {
    nextCell.evidence_url = input.evidenceUrl;
  }
  pm[key] = nextCell;

  const hasYear = await getKpiTargetsHasYearColumn();
  const upsertPayloadBase: Record<string, unknown> = {
    id: targetId,
    kpi_id: input.kpiId,
    performance_monthly: pm,
    approval_step: PERF_STATUS_DRAFT,
    rejection_reason: null,
  };
  if (hasYear) upsertPayloadBase.year = CURRENT_KPI_YEAR;
  if (hasHalfType) upsertPayloadBase.half_type = HALF_TYPE_H1;

  const filtered = await filterPayloadToExistingKpiTargetColumns(upsertPayloadBase);
  if (Object.keys(filtered).length === 0) {
    throw new Error(
      "kpi_targets에 performance_monthly 컬럼이 없습니다. supabase/migrations의 SQL을 실행한 뒤 API 스키마를 새로고침하세요."
    );
  }

  const { data: savedRow, error } = await supabase
    .from("kpi_targets")
    .upsert(filtered)
    .select("id")
    .single();
  if (error) {
    throw new Error(
      `kpi_targets 실적 저장 실패: ${error.message} (컬럼·RLS·network를 확인해 주세요.)`
    );
  }
  const savedId =
    savedRow && typeof (savedRow as { id?: unknown }).id === "string"
      ? (savedRow as { id: string }).id
      : null;
  if (savedId) return { targetId: savedId };
  return { targetId };
}

export async function updateKpiTargetEvidenceUrl(input: {
  targetId: string;
  evidenceUrl: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const tid = input.targetId.trim();
  const url = input.evidenceUrl.trim();
  if (!tid) {
    throw new Error("실적 정보 생성 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!url) throw new Error("증빙 URL이 비어 있습니다.");

  // 환경별 컬럼명 차이 대응 (우선순위: evidence_url)
  const candidateCols = [
    "evidence_url",
    "evidence_file_url",
    "file_url",
    "attachment_url",
  ];
  let writableCol: string | null = null;
  for (const c of candidateCols) {
    if (await getKpiTargetsHasColumn(c)) {
      writableCol = c;
      break;
    }
  }
  if (!writableCol) {
    throw new Error(
      "kpi_targets에 파일 경로 저장 컬럼(evidence_url/evidence_file_url/file_url/attachment_url)을 찾지 못했습니다.\n" +
        "Supabase SQL Editor에서 아래 SQL을 실행해 주세요:\n" +
        "ALTER TABLE public.kpi_targets ADD COLUMN IF NOT EXISTS evidence_url text;\n" +
        "그 다음 Supabase Dashboard > Settings > API > Reload schema 를 눌러 주세요."
    );
  }

  const payload: Record<string, string> = {
    [writableCol]: url,
  };
  const { error } = await supabase
    .from("kpi_targets")
    .update(payload)
    .eq("id", tid);
  if (error) {
    const rawMsg = error.message || "알 수 없는 오류";
    if (/schema cache|could not find the .* column/i.test(rawMsg)) {
      throw new Error(
        `저장 컬럼(${writableCol})을 API schema cache에서 찾지 못했습니다.\n` +
          "1) Supabase SQL Editor에서 실행:\n" +
          "ALTER TABLE public.kpi_targets ADD COLUMN IF NOT EXISTS evidence_url text;\n" +
          "2) Supabase Dashboard > Settings > API > Reload schema\n" +
          "3) 다시 업로드"
      );
    }
    throw new Error(
      `증빙 URL 저장 실패: ${rawMsg} (RLS 정책 또는 ${writableCol} 컬럼을 확인해 주세요.)`
    );
  }
}

/** 월별 JSON에 증빙 경로 저장 (`performance_monthly` 컬럼 필요) */
export async function updatePerformanceMonthlyEvidenceUrl(input: {
  targetId: string;
  month: MonthKey;
  evidenceUrl: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!(await getKpiTargetsHasPerformanceMonthlyColumn())) {
    await updateKpiTargetEvidenceUrl({
      targetId: input.targetId,
      evidenceUrl: input.evidenceUrl,
    });
    return;
  }
  const tid = input.targetId.trim();
  const { data: cur, error: selErr } = await supabase
    .from("kpi_targets")
    .select("performance_monthly")
    .eq("id", tid)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const rec = cur as Record<string, unknown> | null;
  const pm: Record<string, PerformanceMonthlyCell> = {};
  const prevPm = rec?.performance_monthly;
  if (prevPm && typeof prevPm === "object" && !Array.isArray(prevPm)) {
    const o = prevPm as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const cell = o[k];
      if (cell && typeof cell === "object" && !Array.isArray(cell)) {
        pm[k] = { ...(cell as PerformanceMonthlyCell) };
      }
    }
  }
  const key = String(input.month);
  pm[key] = {
    ...(pm[key] ?? {}),
    evidence_url: input.evidenceUrl.trim(),
  };
  const filtered = await filterPayloadToExistingKpiTargetColumns({
    id: tid,
    performance_monthly: pm,
  });
  const { error } = await supabase.from("kpi_targets").update(filtered).eq("id", tid);
  if (error) throw new Error(error.message);
}

export type ApprovalWorkflowStage = "primary" | "final";

/** 승인 대기 실적 목록 (그룹장·팀장 화면) */
export type PendingPerformanceListRow = {
  /** 목록·React key용 (월별: `${targetRowId}:M${월}`) */
  id: string;
  /** kpi_targets 행 ID — 승인 API에 전달 */
  targetRowId: string;
  /** 월별 실적일 때 1~12, 레거시 행 단위면 null */
  month: MonthKey | null;
  periodLabel: string;
  half_type: string;
  achievement_rate: number | null;
  description: string | null;
  evidence_url: string | null;
  approval_step: string;
  departmentName: string;
  kpiMainLabel: string;
  kpiSubLabel: string;
};

export async function fetchPerformancesPendingStage(options: {
  stage: ApprovalWorkflowStage;
  /** 그룹장·팀장 소속 부서 UUID (있으면 해당 부서만) */
  filterDeptId?: string;
}): Promise<PendingPerformanceListRow[]> {
  const supabase = createBrowserSupabase();
  const hasYear = await getKpiTargetsHasYearColumn();
  const hasTargetHalf = await getKpiTargetsHasHalfTypeColumn();

  let tq = supabase
    .from("kpi_targets")
    .select("*, kpi_items(main_topic, sub_topic, dept_id)");
  if (hasYear) tq = tq.eq("year", CURRENT_KPI_YEAR);

  const { data: targetRows, error: te } = await tq;
  if (te) throw new Error(te.message);

  const deptIds = new Set<string>();
  const staged: Array<
    PendingPerformanceListRow & { deptId: string | null }
  > = [];

  for (const rawT of targetRows ?? []) {
    const t = asRecord(rawT);
    const tid = typeof t.id === "string" ? t.id : String(t.id ?? "");
    const itemRaw = t.kpi_items;
    const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw;
    const itemRec = item ? asRecord(item as Record<string, unknown>) : {};
    const deptId =
      typeof itemRec.dept_id === "string" && itemRec.dept_id
        ? itemRec.dept_id
        : null;

    if (options.filterDeptId && deptId !== options.filterDeptId) {
      continue;
    }
    if (deptId) deptIds.add(deptId);

    const perfHalf = hasTargetHalf
      ? normalizeHalfTypeKey(String(t.half_type ?? "")) || HALF_TYPE_H1
      : HALF_TYPE_H1;
    const quarterRangeLabel = legacyQuarterRangeLabelFromTargetRecord(t);

    const pushLegacyRow = (approvalStep: string) => {
      staged.push({
        id: tid,
        targetRowId: tid,
        month: null,
        periodLabel:
          formatKpiTargetActiveMonthRangeLabel(t) ??
          quarterRangeLabel ??
          halfTypeDisplayLabel(perfHalf),
        half_type: perfHalf,
        achievement_rate: targetAchievementPercentFromRecord(t),
        description:
          typeof t.remarks === "string" ? t.remarks : null,
        evidence_url: toEvidencePublicUrl(supabase, t.evidence_url),
        approval_step: approvalStep,
        departmentName: "-",
        kpiMainLabel: pickText(itemRec, [
          "sub_topic",
          "topic_sub",
          "sub_title",
          "subtitle",
        ]),
        kpiSubLabel: pickText(itemRec, ["main_topic", "topic_main"]),
        deptId,
      });
    };

    if (performanceMonthlyIsNonEmpty(t.performance_monthly)) {
      const o = t.performance_monthly as Record<string, unknown>;
      let stagedMonthPending = false;
      for (const mi of KPI_MONTHS) {
        const cell = o[String(mi)];
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
        const c = cell as PerformanceMonthlyCell;
        const st =
          typeof c.approval_step === "string"
            ? c.approval_step.trim().toLowerCase()
            : "";
        const wantPrimary =
          options.stage === "primary" &&
          (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING);
        const wantFinal =
          options.stage === "final" && st === PERF_STATUS_PENDING_FINAL;
        if (!wantPrimary && !wantFinal) continue;
        const rate = toNum(c.achievement_rate as number | string | null | undefined);
        staged.push({
          id: `${tid}:M${mi}`,
          targetRowId: tid,
          month: mi as MonthKey,
          periodLabel: `${mi}월`,
          half_type: monthToHalfTypeLabel(mi as MonthKey),
          achievement_rate: rate,
          description:
            typeof c.remarks === "string" ? c.remarks : null,
          evidence_url: toEvidencePublicUrl(supabase, c.evidence_url),
          approval_step: st,
          departmentName: "-",
          kpiMainLabel: pickText(itemRec, [
            "sub_topic",
            "topic_sub",
            "sub_title",
            "subtitle",
          ]),
          kpiSubLabel: pickText(itemRec, ["main_topic", "topic_main"]),
          deptId,
        });
        stagedMonthPending = true;
      }
      if (stagedMonthPending) continue;
    }

    const approvalStep =
      typeof t.approval_step === "string" ? t.approval_step : "";
    const st = approvalStep.trim().toLowerCase();
    if (
      options.stage === "primary" &&
      (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING)
    ) {
      pushLegacyRow(approvalStep);
    } else if (options.stage === "final" && st === PERF_STATUS_PENDING_FINAL) {
      pushLegacyRow(approvalStep);
    }
  }

  const deptMap = new Map<string, string>();
  if (deptIds.size > 0) {
    const { data: depts, error: de } = await supabase
      .from("departments")
      .select("id, name")
      .in("id", [...deptIds]);
    if (de) throw new Error(de.message);
    for (const d of depts ?? []) {
      if (d && typeof d.id === "string" && typeof d.name === "string") {
        deptMap.set(d.id, d.name);
      }
    }
  }

  return staged.map((r) => {
    const { deptId, ...rest } = r;
    return {
      ...rest,
      departmentName:
        deptId && deptMap.has(deptId) ? deptMap.get(deptId)! : "-",
    };
  });
}

/** @deprecated 2단계 워크플로로 대체 — {@link reviewPerformanceWorkflow} 사용 */
export async function fetchPendingPerformancesForApproval(options?: {
  filterDeptId?: string;
}): Promise<PendingPerformanceListRow[]> {
  return fetchPerformancesPendingStage({
    stage: "primary",
    filterDeptId: options?.filterDeptId,
  });
}

/**
 * 2단계 승인: 그룹장(1차) → 팀장(최종). 반려 시 제출전(draft) + 사유.
 * @param performanceId kpi_targets 행 UUID. 월별 승인 대기 목록의 복합 키(targetRowId + ":M" + 월)도 허용.
 * @param options.month 월별 실적(`performance_monthly`)일 때만 지정(복합 ID면 생략 가능).
 */
export async function reviewPerformanceWorkflow(
  performanceId: string,
  input:
    | { action: "approve_primary" }
    | { action: "approve_final" }
    | { action: "reject"; rejectionReason: string },
  options?: { month?: MonthKey }
): Promise<void> {
  const supabase = createBrowserSupabase();
  let tid = performanceId.trim();
  if (!tid) {
    throw new Error("대상 ID가 없습니다.");
  }
  /** 승인 대기 목록 등: `${kpi_targets.id}:M${월}` → 행 ID + 월 분리 */
  let monthFromComposite: MonthKey | undefined;
  const compositeIdx = tid.indexOf(":M");
  if (compositeIdx > 0) {
    const base = tid.slice(0, compositeIdx);
    const suffix = tid.slice(compositeIdx + 2);
    const mo = Number(suffix);
    if (
      suffix !== "" &&
      Number.isInteger(mo) &&
      mo >= 1 &&
      mo <= 12
    ) {
      tid = base;
      monthFromComposite = mo as MonthKey;
    }
  }
  const month =
    options?.month !== undefined ? options.month : monthFromComposite;

  const { data: exists, error: exErr } = await supabase
    .from("kpi_targets")
    .select("id")
    .eq("id", tid)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (!exists) {
    throw new Error("kpi_targets 행을 찾을 수 없습니다.");
  }

  if (
    month !== undefined &&
    (await getKpiTargetsHasPerformanceMonthlyColumn())
  ) {
    const { data: cur, error: rErr } = await supabase
      .from("kpi_targets")
      .select("performance_monthly")
      .eq("id", tid)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    const rec = cur as Record<string, unknown> | null;
    const pm: Record<string, PerformanceMonthlyCell> = {};
    const prevPm = rec?.performance_monthly;
    if (prevPm && typeof prevPm === "object" && !Array.isArray(prevPm)) {
      const o = prevPm as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const cell = o[k];
        if (cell && typeof cell === "object" && !Array.isArray(cell)) {
          pm[k] = { ...(cell as PerformanceMonthlyCell) };
        }
      }
    }
    const key = String(month);
    const cell = pm[key];
    if (!cell || typeof cell !== "object") {
      throw new Error("해당 월 실적 데이터를 찾을 수 없습니다.");
    }
    const curSt =
      typeof cell.approval_step === "string"
        ? cell.approval_step.trim().toLowerCase()
        : "";

    if (input.action === "approve_primary") {
      if (
        curSt !== PERF_STATUS_PENDING_PRIMARY &&
        curSt !== PERF_LEGACY_PENDING
      ) {
        throw new Error("1차 승인 대기 상태가 아닙니다.");
      }
      pm[key] = {
        ...cell,
        approval_step: PERF_STATUS_PENDING_FINAL,
        rejection_reason: null,
      };
    } else if (input.action === "approve_final") {
      if (curSt !== PERF_STATUS_PENDING_FINAL) {
        throw new Error("최종 승인 대기 상태가 아닙니다.");
      }
      pm[key] = {
        ...cell,
        approval_step: PERF_STATUS_APPROVED,
        rejection_reason: null,
      };
    } else {
      const reason = input.rejectionReason.trim();
      if (!reason) throw new Error("반려 사유를 입력해 주세요.");
      if (
        curSt !== PERF_STATUS_PENDING_PRIMARY &&
        curSt !== PERF_STATUS_PENDING_FINAL &&
        curSt !== PERF_LEGACY_PENDING
      ) {
        throw new Error("반려할 수 있는 승인 단계가 아닙니다.");
      }
      pm[key] = {
        ...cell,
        approval_step: PERF_STATUS_DRAFT,
        rejection_reason: reason,
      };
    }

    const filtered = await filterPayloadToExistingKpiTargetColumns({
      id: tid,
      performance_monthly: pm,
    });
    const { error } = await supabase
      .from("kpi_targets")
      .update(filtered)
      .eq("id", tid);
    if (error) throw new Error(error.message);
    return;
  }

  if (input.action === "approve_primary") {
    const { error } = await supabase
      .from("kpi_targets")
      .update({
        approval_step: PERF_STATUS_PENDING_FINAL,
        rejection_reason: null,
      })
      .eq("id", tid)
      .in("approval_step", [PERF_STATUS_PENDING_PRIMARY, PERF_LEGACY_PENDING]);
    if (error) throw new Error(error.message);
    return;
  }
  if (input.action === "approve_final") {
    const { error } = await supabase
      .from("kpi_targets")
      .update({
        approval_step: PERF_STATUS_APPROVED,
        rejection_reason: null,
      })
      .eq("id", tid)
      .eq("approval_step", PERF_STATUS_PENDING_FINAL);
    if (error) throw new Error(error.message);
    return;
  }
  const reason = input.rejectionReason.trim();
  if (!reason) throw new Error("반려 사유를 입력해 주세요.");
  const { error } = await supabase
    .from("kpi_targets")
    .update({
      approval_step: PERF_STATUS_DRAFT,
      rejection_reason: reason,
    })
    .eq("id", tid)
    .in("approval_step", [
      PERF_STATUS_PENDING_PRIMARY,
      PERF_STATUS_PENDING_FINAL,
      PERF_LEGACY_PENDING,
    ]);
  if (error) throw new Error(error.message);
}

export type DepartmentManageRow = {
  id: string;
  name: string;
};

export async function fetchDepartmentsForManagement(): Promise<
  DepartmentManageRow[]
> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentManageRow[];
}

export async function createDepartment(name: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const clean = name.trim();
  if (!clean) throw new Error("부서명을 입력해 주세요.");
  const { error } = await supabase.from("departments").insert({ name: clean });
  if (error) throw new Error(error.message);
}

export async function renameDepartment(input: {
  id: string;
  name: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const clean = input.name.trim();
  if (!clean) throw new Error("부서명을 입력해 주세요.");
  const { error } = await supabase
    .from("departments")
    .update({ name: clean })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function removeDepartment(departmentId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.from("departments").delete().eq("id", departmentId);
  if (error) throw new Error(error.message);
}

/**
 * KPI 항목 삭제 (관리자 전용 UI에서 호출)
 * - FK cascade가 설정되어 있으면 kpi_items 삭제만으로 targets가 함께 삭제됨
 * - 미설정 환경 호환을 위해 targets 선삭제를 보조로 수행
 */
export async function removeKpiItemCascade(kpiItemId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const cleanId = kpiItemId.trim();
  if (!cleanId) throw new Error("삭제할 KPI 항목 ID가 없습니다.");

  const { error: targetErr } = await supabase
    .from("kpi_targets")
    .delete()
    .eq("kpi_id", cleanId);
  if (targetErr) {
    throw new Error(
      `연결된 kpi_targets 삭제 실패: ${targetErr.message} (FK/RLS 정책을 확인해 주세요.)`
    );
  }

  const { error: itemErr } = await supabase
    .from("kpi_items")
    .delete()
    .eq("id", cleanId);
  if (itemErr) {
    throw new Error(
      `kpi_items 삭제 실패: ${itemErr.message} (FK/RLS 정책을 확인해 주세요.)`
    );
  }
}

/** 그룹장·관리자 UI: 항목별 실적 방식 및 목표값(`target_value`) */
export async function updateKpiItemIndicatorSettings(input: {
  kpiItemId: string;
  indicatorType: KpiIndicatorType;
  targetPpm: number | null;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const id = input.kpiItemId.trim();
  if (!id) throw new Error("KPI 항목 ID가 없습니다.");
  if (input.indicatorType === "normal") {
    const { error } = await supabase
      .from("kpi_items")
      .update({ indicator_type: "normal", target_value: null })
      .eq("id", id);
    if (error) {
      throw new Error(
        `${error.message} (kpi_items.indicator_type / target_value 컬럼·RLS를 확인해 주세요.)`
      );
    }
    return;
  }
  const t = input.targetPpm;
  if (t === null || !Number.isFinite(t) || t <= 0) {
    throw new Error(
      "PPM·수량(k)·건수 방식은 목표값을 0보다 큰 숫자로 입력해 주세요. 수량(k)은 k(천) 단위입니다."
    );
  }
  const { error } = await supabase
    .from("kpi_items")
    .update({ indicator_type: input.indicatorType, target_value: t })
    .eq("id", id);
  if (error) {
    throw new Error(
      `${error.message} (kpi_items.indicator_type / target_value 컬럼·RLS를 확인해 주세요.)`
    );
  }
}

export async function clearAllKpiData(): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error: targetErr } = await supabase.from("kpi_targets").delete().not("id", "is", null);
  if (targetErr) {
    throw new Error(`kpi_targets 초기화 실패: ${targetErr.message}`);
  }
  const { error: itemErr } = await supabase.from("kpi_items").delete().not("id", "is", null);
  if (itemErr) {
    throw new Error(`kpi_items 초기화 실패: ${itemErr.message}`);
  }
}

export type MonthDeadlineRow = {
  month: MonthKey;
  input_deadline: string | null;
};

export async function fetchMonthDeadlines(): Promise<MonthDeadlineRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("system_settings")
    .select("quarter, input_deadline")
    .order("quarter", { ascending: true });
  if (error) {
    throw new Error(
      `${error.message} (system_settings 테이블이 없다면 schema-kpi.sql의 생성 SQL을 실행해 주세요.)`
    );
  }
  const out = new Map<MonthKey, string | null>();
  for (const m of KPI_MONTHS) out.set(m, null);
  for (const row of data ?? []) {
    const raw = String((row as { quarter?: unknown }).quarter ?? "").trim();
    const mm = raw.match(/^M(\d{1,2})$/i);
    if (mm?.[1]) {
      const n = Number(mm[1]);
      if (n >= 1 && n <= 12) {
        out.set(n as MonthKey, (row as { input_deadline?: string | null }).input_deadline ?? null);
      }
      continue;
    }
    const q = raw.match(/([1-4])\s*Q/i);
    if (q?.[1]) {
      const qq = Number(q[1]);
      const months =
        qq === 1 ? [1, 2, 3] : qq === 2 ? [4, 5, 6] : qq === 3 ? [7, 8, 9] : [10, 11, 12];
      const v = (row as { input_deadline?: string | null }).input_deadline ?? null;
      for (const m of months) out.set(m as MonthKey, v);
    }
  }
  return KPI_MONTHS.map((m) => ({ month: m, input_deadline: out.get(m) ?? null }));
}

export async function saveMonthDeadline(input: {
  month: MonthKey;
  input_deadline: string | null;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const key = monthToHalfTypeLabel(input.month);
  const { data: updated, error: updateErr } = await supabase
    .from("system_settings")
    .update({ input_deadline: input.input_deadline })
    .eq("quarter", key)
    .select("quarter");
  if (updateErr) {
    throw new Error(
      `${updateErr.message} (system_settings 테이블이 없다면 schema-kpi.sql의 생성 SQL을 실행해 주세요.)`
    );
  }
  if (updated && updated.length > 0) {
    return;
  }

  const { error } = await supabase.from("system_settings").insert({
    quarter: key,
    input_deadline: input.input_deadline,
  });
  if (error) throw new Error(error.message);
}

export type KpiExcelImportRow = {
  mainTopic: string;
  subTopic: string;
  detailItem: string;
  bmValue: string;
  baseline: string;
  firstHalfTarget: string;
  firstHalfRate: string;
  firstHalfEffect: string;
  secondHalfTarget: string;
  secondHalfRate: string;
  secondHalfEffect: string;
  challengeTarget: string;
  weight: string;
  managerName: string;
  note: string;
};

export type CreateManualKpiInput = {
  deptId: string;
  mainTopic: string;
  subTopic: string;
  detailActivity: string;
  baselineLabel: string;
  owner: string;
  weight: number;
  indicatorType: KpiIndicatorType;
  targetDirection: "up" | "down" | "na";
  targetValue: number | null;
  periodStartMonth: number;
  periodEndMonth: number;
  targetFinalValue: number;
  h1TargetValue: number;
  h2TargetValue: number | null;
  h1TargetText: string;
  h2TargetText: string;
};

function parseWeightOrZero(raw: string): number {
  const n = Number(String(raw ?? "").trim());
  if (Number.isFinite(n)) return n;
  return 0;
}

function parsePercentOrNull(raw: string): number | null {
  const m = String(raw ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

export async function createManualKpiItem(
  input: CreateManualKpiInput
): Promise<string> {
  const supabase = createBrowserSupabase();
  const safeWeight = Math.trunc(input.weight);
  if (!Number.isFinite(safeWeight) || safeWeight < 1 || safeWeight > 100) {
    throw new Error("가중치는 1~100 사이 정수로 입력해 주세요.");
  }
  const { data: existingItems, error: sumErr } = await supabase
    .from("kpi_items")
    .select("weight")
    .eq("dept_id", input.deptId);
  if (sumErr) {
    throw new Error(sumErr.message);
  }
  const existingSum = (existingItems ?? []).reduce((sum, row) => {
    const n = Number(String((row as Record<string, unknown>).weight ?? "").trim());
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  if (existingSum + safeWeight > 100) {
    throw new Error(
      `부서 가중치 합계가 100점을 초과합니다. 현재 ${existingSum}점, 추가 ${safeWeight}점으로 ${
        existingSum + safeWeight
      }점입니다.`
    );
  }

  const { data: inserted, error: itemErr } = await supabase
    .from("kpi_items")
    .insert({
      dept_id: input.deptId,
      main_topic: input.mainTopic.trim(),
      sub_topic: input.subTopic.trim(),
      detail_activity: input.detailActivity.trim(),
      benchmark: input.baselineLabel.trim(),
      standard: input.baselineLabel.trim(),
      weight: safeWeight,
      manager_name: input.owner.trim(),
      indicator_type: input.indicatorType,
      target_value: input.targetValue,
      period_start_month: input.periodStartMonth,
      period_end_month: input.periodEndMonth,
      target_direction: input.targetDirection,
      target_final_value: input.targetFinalValue,
    })
    .select("id")
    .single();
  if (itemErr || !inserted?.id) {
    throw new Error(itemErr?.message || "KPI 항목 생성에 실패했습니다.");
  }

  const hasYearColumn = await getKpiTargetsHasYearColumn();
  const hasH1TargetPct = await getKpiTargetsHasColumn("h1_target_pct");
  const hasH2TargetPct = await getKpiTargetsHasColumn("h2_target_pct");
  const hasH1TargetValue = await getKpiTargetsHasColumn("h1_target_value");
  const hasH2TargetValue = await getKpiTargetsHasColumn("h2_target_value");
  const targetPayload: Record<string, unknown> = {
    kpi_id: inserted.id,
    half_type: HALF_TYPE_H1,
    h1_target: input.h1TargetText.trim() || null,
    h2_target: input.h2TargetText.trim() || null,
    h1_effect: input.h1TargetText.trim() || null,
    h2_effect: input.h2TargetText.trim() || null,
    approval_step: PERF_STATUS_DRAFT,
    rejection_reason: null,
  };
  if (hasH1TargetValue) {
    targetPayload.h1_target_value = input.h1TargetValue;
  }
  if (hasH2TargetValue) {
    targetPayload.h2_target_value = input.h2TargetValue;
  }
  if (hasH1TargetPct) {
    targetPayload.h1_target_pct = input.h1TargetValue;
    targetPayload.h1_rate = null;
  } else {
    targetPayload.h1_rate = input.h1TargetValue;
  }
  if (hasH2TargetPct) {
    targetPayload.h2_target_pct = input.h2TargetValue;
    targetPayload.h2_rate = null;
  } else {
    targetPayload.h2_rate = input.h2TargetValue;
  }
  if (hasYearColumn) targetPayload.year = CURRENT_KPI_YEAR;

  const filtered = await filterPayloadToExistingKpiTargetColumns(targetPayload);
  const { error: targetErr } = await supabase.from("kpi_targets").insert(filtered);
  if (targetErr) {
    throw new Error(targetErr.message);
  }
  const milestones = [
    { target_month: 6, target_value: input.h1TargetValue, note: input.h1TargetText.trim() || null },
    { target_month: 12, target_value: input.h2TargetValue, note: input.h2TargetText.trim() || null },
  ].filter((m) => m.target_value !== null && Number.isFinite(m.target_value));
  const milestoneRows = milestones
    .filter((m) => m.target_month >= input.periodStartMonth && m.target_month <= input.periodEndMonth)
    .map((m) => ({
      kpi_id: inserted.id,
      target_month: m.target_month,
      target_value: m.target_value,
      note: m.note,
    }));
  if (milestoneRows.length > 0) {
    const { error: milestoneErr } = await supabase.from("kpi_milestones").upsert(milestoneRows);
    if (milestoneErr) throw new Error(milestoneErr.message);
  }
  return inserted.id as string;
}

async function upsertKpiItemCompat(input: {
  deptId: string;
  mainTopic: string;
  subTopic: string;
  detailItem: string;
  bmValue: string;
  baseline: string;
  weight: string;
  managerName: string;
  note: string;
  existingByComposite: Map<string, string>;
}): Promise<string> {
  const supabase = createBrowserSupabase();
  const normalizedSubTopic = input.subTopic.trim();
  const normalizedDetail = input.detailItem.trim();
  const compositeKey = `${normalizedSubTopic}||${normalizedDetail}`;
  const existingId = input.existingByComposite.get(compositeKey) ?? null;
  const safeWeight = parseWeightOrZero(input.weight);

  const basePayload = {
    dept_id: input.deptId,
    main_topic: input.mainTopic,
    sub_topic: input.subTopic,
    detail_activity: input.detailItem,
    benchmark: input.bmValue,
    standard: input.baseline,
    weight: safeWeight,
    manager_name: input.managerName,
  };
  if (existingId) {
    const updated = await supabase
      .from("kpi_items")
      .update(basePayload)
      .eq("id", existingId)
      .select("id")
      .single();
    if (updated.error || !updated.data?.id) {
      throw new Error(updated.error?.message || "kpi_items 업데이트 실패");
    }
    return updated.data.id as string;
  }

  const inserted = await supabase
    .from("kpi_items")
    .insert({
      ...basePayload,
      indicator_type: "normal",
      target_value: null as number | null,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(inserted.error?.message || "kpi_items 등록 실패");
  }
  const savedId = inserted.data.id as string;
  input.existingByComposite.set(compositeKey, savedId);
  return savedId;
}

async function upsertKpiTargetsCompat(input: {
  kpiId: string;
  firstHalfTarget: string;
  firstHalfRate: string;
  firstHalfEffect: string;
  secondHalfTarget: string;
  secondHalfRate: string;
  secondHalfEffect: string;
  challengeTarget: string;
  note: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const hasH1TargetPct = await getKpiTargetsHasColumn("h1_target_pct");
  const hasH2TargetPct = await getKpiTargetsHasColumn("h2_target_pct");

  const payloadCore: Record<string, unknown> = {
    h1_target: input.firstHalfTarget || null,
    h1_effect: input.firstHalfEffect || null,
    h2_target: input.secondHalfTarget || null,
    h2_effect: input.secondHalfEffect || null,
    challenge_goal: input.challengeTarget || null,
    remarks: input.note || null,
    approval_step: PERF_STATUS_DRAFT,
    rejection_reason: null as string | null,
    half_type: HALF_TYPE_H1,
  };
  if (hasH1TargetPct) {
    payloadCore.h1_target_pct = parsePercentOrNull(input.firstHalfRate);
    payloadCore.h1_rate = null;
  } else {
    payloadCore.h1_rate = parsePercentOrNull(input.firstHalfRate);
  }
  if (hasH2TargetPct) {
    payloadCore.h2_target_pct = parsePercentOrNull(input.secondHalfRate);
    payloadCore.h2_rate = null;
  } else {
    payloadCore.h2_rate = parsePercentOrNull(input.secondHalfRate);
  }
  const yearProbe = await supabase.from("kpi_targets").select("year").limit(1);
  const hasYearColumn = !yearProbe.error;
  if (
    yearProbe.error &&
    !/column .*year.* does not exist/i.test(yearProbe.error.message)
  ) {
    throw new Error(yearProbe.error.message);
  }

  const deleteQuery = supabase.from("kpi_targets").delete().eq("kpi_id", input.kpiId);
  const deleted = hasYearColumn
    ? await deleteQuery.eq("year", CURRENT_KPI_YEAR)
    : await deleteQuery;
  if (deleted.error) throw new Error(deleted.error.message);

  const payload = hasYearColumn
    ? { kpi_id: input.kpiId, year: CURRENT_KPI_YEAR, ...payloadCore }
    : { kpi_id: input.kpiId, ...payloadCore };
  const filtered = await filterPayloadToExistingKpiTargetColumns(payload);
  const inserted = await supabase.from("kpi_targets").insert(filtered);
  if (inserted.error) throw new Error(inserted.error.message);
}

export async function importKpisFromExcelRows(input: {
  deptId: string;
  rows: KpiExcelImportRow[];
}): Promise<number> {
  const supabase = createBrowserSupabase();
  const existingByComposite = new Map<string, string>();

  const schemaPreflight = await Promise.all([
    supabase
      .from("kpi_items")
      .select("id, dept_id, main_topic, sub_topic, detail_activity, benchmark, standard, weight, manager_name")
      .limit(1),
    supabase
      .from("kpi_targets")
      .select(
        "id, kpi_id, h1_target, h1_target_pct, h1_rate, h1_effect, h2_target, h2_target_pct, h2_rate, h2_effect, challenge_goal, remarks"
      )
      .limit(1),
  ]);
  for (const res of schemaPreflight) {
    if (res.error) {
      throw new Error(
        `${res.error.message} (컬럼 추가 직후라면 Supabase API 스키마 캐시를 새로고침해 주세요.)`
      );
    }
  }

  const existingWithDetail = await supabase
    .from("kpi_items")
    .select("id, sub_topic, detail_activity")
    .eq("dept_id", input.deptId);
  if (!existingWithDetail.error) {
    for (const r of existingWithDetail.data ?? []) {
      const sub = typeof r.sub_topic === "string" ? r.sub_topic.trim() : "";
      const detailRaw = (r as Record<string, unknown>).detail_activity;
      const detail = typeof detailRaw === "string" ? detailRaw.trim() : "";
      const key = `${sub}||${detail}`;
      existingByComposite.set(key, r.id);
    }
  } else {
    throw new Error(existingWithDetail.error.message);
  }

  let successCount = 0;

  for (const row of input.rows) {
    if (!row.mainTopic && !row.subTopic && !row.detailItem) continue;

    const kpiId = await upsertKpiItemCompat({
      deptId: input.deptId,
      mainTopic: row.mainTopic || "-",
      subTopic: row.subTopic || "-",
      detailItem: row.detailItem || "",
      bmValue: row.bmValue || "-",
      baseline: row.baseline || "",
      weight: row.weight || "-",
      managerName: row.managerName || "-",
      note: row.note || "",
      existingByComposite,
    });

    await upsertKpiTargetsCompat({
      kpiId,
      firstHalfTarget: row.firstHalfTarget,
      firstHalfRate: row.firstHalfRate,
      firstHalfEffect: row.firstHalfEffect,
      secondHalfTarget: row.secondHalfTarget,
      secondHalfRate: row.secondHalfRate,
      secondHalfEffect: row.secondHalfEffect,
      challengeTarget: row.challengeTarget,
      note: row.note,
    });

    successCount += 1;
  }

  return successCount;
}
