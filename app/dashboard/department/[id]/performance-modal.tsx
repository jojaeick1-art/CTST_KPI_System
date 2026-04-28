"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Props as RechartsLegendContentProps } from "recharts/types/component/DefaultLegendContent";
import { Download, Eye, FilePenLine, ImageIcon, Loader2, Upload, X } from "lucide-react";
import {
  PERF_LEGACY_PENDING,
  PERF_STATUS_APPROVED,
  PERF_STATUS_PENDING_FINAL,
  PERF_STATUS_PENDING_PRIMARY,
  isWriterPerformanceLockedByStep,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  resolveEvidencePublicUrl,
  getKpiTargetsHasPerformanceMonthlyColumn,
  computedAchievementPercent,
  qualitativeAchievementPercent,
  indicatorUsesComputedAchievement,
  type ItemPerformanceRow,
  type KpiAchievementCap,
  type KpiAggregationType,
  type KpiEvaluationType,
  type KpiIndicatorType,
  type KpiQualitativeCalcType,
  type KpiTargetFillPolicy,
  updatePerformanceMonthlyCalculatedRates,
  updatePerformanceMonthlyEvidenceUrl,
  uploadEvidenceFile,
  resolveEffectiveIndicatorTypeForUi,
  resolveComputedTargetMetric,
  resolveNormalMonthlyTargetMetric,
  type NormalMonthlyTargetContext,
} from "@/src/lib/kpi-queries";
import {
  KPI_MONTHS,
  activeMonthsForSchedule,
  formatAxisLabel,
  halfTypeLabelToMonth,
  monthTargetPercent,
  scheduleMonthsFromItemDates,
  type MonthKey,
} from "@/src/lib/kpi-month";
import {
  formatKoMax2Decimals,
  formatKoPercentMax2,
} from "@/src/lib/format-display-number";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  canGroupLeaderApprove,
  canTeamLeaderFinalApprove,
  isAdminRole,
  normalizeRole,
} from "@/src/lib/rbac";
import { AppToast, type ToastState } from "@/src/components/ui/toast";

type KpiModalItem = {
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
  monthlyTargets: Partial<Record<number, number>>;
  monthlyTargetNotes: Partial<Record<number, string>>;
  scheduleRaw: string | null;
  indicatorType: KpiIndicatorType;
  /** ppm·quantity·count 공통 목표 (`kpi_items.target_value`) */
  targetPpm: number | null;
  status: string;
  isFinalCompleted: boolean;
  evaluationType: KpiEvaluationType | null;
  unit: string | null;
  qualitativeCalcType: KpiQualitativeCalcType | null;
  aggregationType: KpiAggregationType | null;
  targetFillPolicy: KpiTargetFillPolicy | null;
  achievementCap: KpiAchievementCap;
  needsStructureReview?: boolean;
};

function computedActualLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "실적 PPM";
  if (t === "quantity") return "실적 수량(k)";
  if (t === "count") return "실적 건수";
  if (t === "headcount") return "실적 인원(명)";
  if (t === "money") return "실적(억)";
  if (t === "time") return "실적 시간(h)";
  if (t === "uph") return "실적 UPH";
  return "실적";
}

function computedTargetLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "목표 PPM";
  if (t === "quantity") return "목표 수량(k)";
  if (t === "count") return "목표 건수";
  if (t === "headcount") return "목표 인원(명)";
  if (t === "money") return "목표(억)";
  if (t === "time") return "목표 시간(h)";
  if (t === "uph") return "목표 UPH";
  return "목표";
}

function computedFormulaHint(t: KpiIndicatorType): string {
  if (t === "ppm") return "Max(0, (2 − 실적/목표) × 100)";
  if (t === "quantity") {
    return "높을수록 좋음: 실적÷목표×100. 낮을수록 좋음: 목표÷실적×100 (상한 100%). 단위 k(천).";
  }
  if (t === "count") {
    return "높을수록 좋음: 실적÷목표×100. 낮을수록 좋음: 목표÷실적×100 (상한 100%).";
  }
  if (t === "headcount") {
    return "인원(명): 높을수록 좋음·낮을수록 좋음은 수량(k)과 동일 공식.";
  }
  if (t === "money") {
    return "금액(억): 높을수록 좋음·낮을수록 좋음은 수량(k)과 동일 공식, 숫자는 억 단위.";
  }
  if (t === "time") {
    return "시간(h): 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  if (t === "uph") {
    return "UPH: 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  return "";
}

function computedKindSummaryKo(t: KpiIndicatorType): string {
  if (t === "ppm") return "역지표(PPM)";
  if (t === "quantity") return "수량(k)";
  if (t === "count") return "건수";
  if (t === "headcount") return "인원(명)";
  if (t === "money") return "금액(억)";
  if (t === "time") return "시간(h)";
  if (t === "uph") return "생산성(UPH)";
  return "";
}
import {
  useKpiPerformances,
  useUpsertMonthPerformance,
  useWorkflowReviewMutation,
} from "@/src/hooks/useKpiQueries";

type ChartDatum = {
  periodLabel: string;
  month: MonthKey | 0;
  target: number | null;
  actual: number;
  submittedPercent: number | null;
  description: string | null;
  bubbleNote: string | null;
  evidence_url: string | null;
  hasComment: boolean;
  challengeMet: boolean;
  isBenchmark?: boolean;
  copiedFromMonth?: MonthKey;
  /** 막대 높이는 달성률 유지, 상단에는 제출 지표 문자열만(있을 때만) */
  barTopLabel?: string;
  commentLabel?: string;
  targetNoteLabel?: string;
};

/** 승인 반영 전이라도 해당 월에 실적 숫자가 저장돼 있으면 true (0%·0ppm 포함) */
function monthHasSubmittedPerformanceInput(
  indicatorType: KpiIndicatorType,
  row: ItemPerformanceRow | undefined,
  rawSubmittedPercent: number | null
): boolean {
  if (!row) return false;
  if (indicatorType === "normal") {
    const av = row.actual_value;
    if (av !== null && av !== undefined && Number.isFinite(Number(av))) {
      return true;
    }
  }
  if (indicatorUsesComputedAchievement(indicatorType)) {
    const av = row.actual_value;
    if (av !== null && av !== undefined && Number.isFinite(Number(av))) {
      return true;
    }
    return rawSubmittedPercent !== null;
  }
  return rawSubmittedPercent !== null;
}

/** 막대 위 표기: 일반(%) / PPM·수량(k)·건수 원값 (승인 전·0%여도 저장값이 있으면 표시) */
function chartBarTopLabel(
  indicatorType: KpiIndicatorType,
  row: ItemPerformanceRow | undefined,
  showBarTopLabel: boolean,
  rawSubmittedPercent: number | null
): string {
  if (!showBarTopLabel) return "";
  if (indicatorUsesComputedAchievement(indicatorType)) {
    const av = row?.actual_value;
    if (av !== null && av !== undefined) {
      const n = Number(av);
      if (Number.isFinite(n)) {
        if (indicatorType === "ppm") return `${formatKoMax2Decimals(n)}ppm`;
        if (indicatorType === "quantity") return `${formatKoMax2Decimals(n)}k`;
        if (indicatorType === "count") return `${formatKoMax2Decimals(n)}건`;
        if (indicatorType === "headcount") return `${formatKoMax2Decimals(n)}명`;
        if (indicatorType === "money") return `${formatKoMax2Decimals(n)}억`;
        if (indicatorType === "time") return `${formatKoMax2Decimals(n)}h`;
        if (indicatorType === "uph") return `${formatKoMax2Decimals(n)} UPH`;
      }
    }
    if (rawSubmittedPercent !== null && rawSubmittedPercent !== undefined) {
      const pct = Number(rawSubmittedPercent);
      if (Number.isFinite(pct)) {
        return formatKoPercentMax2(pct);
      }
    }
    return "";
  }
  if (indicatorType === "normal") {
    const avn = row?.actual_value;
    if (avn !== null && avn !== undefined) {
      const n = Number(avn);
      if (Number.isFinite(n)) {
        return `${formatKoMax2Decimals(n)}%`;
      }
    }
  }
  if (rawSubmittedPercent === null || rawSubmittedPercent === undefined) return "";
  const pct = Number(rawSubmittedPercent);
  if (!Number.isFinite(pct)) return "";
  return formatKoPercentMax2(pct);
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  kpiItem: KpiModalItem | null;
  startMode: "viewer" | "editor";
  /** 선임/프로·권한 없음 등: 뷰어만 */
  canEditPerformance?: boolean;
  /** 로그인 사용자 `profiles.role` (한글·영문) — 승인 버튼 노출용 */
  profileRole?: string | null;
  /** 관리자·팀장·그룹장 KPI 항목 삭제 */
  canDeleteKpiItem?: boolean;
  onDeleteKpiItem?: (kpiId: string) => Promise<void> | void;
  canFinalizeKpiItem?: boolean;
  onFinalizeKpiItem?: (
    kpiId: string,
    completed?: boolean
  ) => Promise<boolean> | boolean;
  onExtendPeriodEndMonth?: (kpiId: string) => Promise<boolean> | boolean;
};

function toNumber(v: string): number | null {
  const n = Number(v);
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

function parseNonNegativeDecimal(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseBenchmarkValue(raw: string | null | undefined): number | null {
  const match = String(raw ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function isChartVisibleStep(step: string | null | undefined): boolean {
  const s = (step?.trim().toLowerCase() ?? "");
  return s === PERF_STATUS_PENDING_FINAL || s === PERF_STATUS_APPROVED;
}

function findRowByMonth(
  rows: ItemPerformanceRow[],
  m: MonthKey
): ItemPerformanceRow | null {
  return rows.find((r) => halfTypeLabelToMonth(r.half_type) === m) ?? null;
}

function findLatestPriorRowWithSubmittedValue(
  rowByMonth: Map<MonthKey, ItemPerformanceRow>,
  month: MonthKey,
  monthList: MonthKey[]
): { month: MonthKey; row: ItemPerformanceRow } | null {
  const idx = monthList.indexOf(month);
  if (idx <= 0) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const prevMonth = monthList[i]!;
    const prevRow = rowByMonth.get(prevMonth);
    if (!prevRow) continue;
    const hasRate =
      prevRow.achievement_rate !== null &&
      prevRow.achievement_rate !== undefined &&
      !Number.isNaN(Number(prevRow.achievement_rate));
    const hasActual =
      prevRow.actual_value !== null &&
      prevRow.actual_value !== undefined &&
      Number.isFinite(Number(prevRow.actual_value));
    if (hasRate || hasActual) {
      return { month: prevMonth, row: prevRow };
    }
  }
  return null;
}

function resolveMonthlyTargetForMonth(
  monthlyTargets: Partial<Record<number, number>> | undefined,
  month: MonthKey,
  policy: KpiTargetFillPolicy | null | undefined = "exclude"
): number | null {
  const raw = monthlyTargets?.[month];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (policy === "carry_forward") {
    for (let m = month - 1; m >= 1; m -= 1) {
      const prev = monthlyTargets?.[m];
      if (typeof prev === "number" && Number.isFinite(prev)) {
        return prev;
      }
    }
  }
  return null;
}

function cumulativeTargetThroughMonth(
  monthlyTargets: Partial<Record<number, number>> | undefined,
  month: MonthKey
): number | null {
  let sum = 0;
  let hasTarget = false;
  for (let m = 1; m <= month; m += 1) {
    const value = monthlyTargets?.[m];
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      hasTarget = true;
    }
  }
  return hasTarget ? sum : null;
}

function resolvePerformanceAggregationType(
  row: ItemPerformanceRow | null | undefined,
  fallback: KpiAggregationType | null | undefined
): KpiAggregationType {
  return row?.aggregation_type ?? fallback ?? "monthly";
}

function aggregationTypeLabelKo(value: KpiAggregationType): string {
  return value === "cumulative" ? "누적 계산" : "당월 단독";
}

function cumulativeActualThroughPriorMonths(
  rowByMonth: Map<MonthKey, ItemPerformanceRow>,
  monthList: MonthKey[],
  month: MonthKey
): number {
  return monthList.reduce((sum, m) => {
    if (m >= month) return sum;
    const prior = rowByMonth.get(m)?.actual_value;
    const priorValue =
      prior !== null && prior !== undefined && Number.isFinite(Number(prior))
        ? Number(prior)
        : 0;
    return sum + priorValue;
  }, 0);
}

function performanceStatusLabelKo(status: string | null | undefined): string {
  const s = status?.trim().toLowerCase() ?? "";
  if (s === "draft") return "제출 전";
  if (s === "pending_primary" || s === "pending") return "1차 승인 대기";
  if (s === PERF_STATUS_PENDING_FINAL) return "최종 승인 대기";
  if (s === PERF_STATUS_APPROVED) return "승인 완료";
  return status?.trim() ? status.trim() : "—";
}

function ragColor(rate: number | null, selected: boolean, challengeMet: boolean): string {
  if (challengeMet) return "#f59e0b";
  if (rate === null || !Number.isFinite(rate)) return selected ? "#0369a1" : "#0284c7";
  if (rate >= 95) return selected ? "#047857" : "#10b981";
  if (rate >= 80) return selected ? "#b45309" : "#f59e0b";
  return selected ? "#b91c1c" : "#ef4444";
}

function statusTimelineIndex(status: string | null | undefined): number {
  const s = (status ?? "").trim().toLowerCase();
  if (!s || s === "draft") return 0;
  if (s === "pending_primary" || s === "pending") return 1;
  if (s === PERF_STATUS_PENDING_FINAL) return 2;
  if (s === PERF_STATUS_APPROVED) return 3;
  return 0;
}

function previewComment(text: string | null, max = 52): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 비관리자: draft(또는 비어 있음)만 편집 가능. 관리자는 항상 편집 가능. */
function monthLockedForEditor(
  step: string | null | undefined,
  canOverrideLock: boolean
): boolean {
  if (canOverrideLock) return false;
  return isWriterPerformanceLockedByStep(step);
}

function KpiChartTooltip({
  active,
  payload,
  indicatorType,
}: {
  active?: boolean;
  payload?: { payload?: ChartDatum }[];
  indicatorType: KpiIndicatorType;
}) {
  if (!active || !payload?.length) return null;
  const d =
    payload.find((p) => p.payload)?.payload ?? (payload[0]!.payload as ChartDatum | undefined);
  if (!d) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-semibold text-slate-800">{d.periodLabel}</p>
      {d.isBenchmark ? (
        <p className="text-indigo-700">B/M {d.barTopLabel || chartValueLabel(indicatorType, d.actual)}</p>
      ) : (
        <>
          <p className="text-slate-600">
            목표 {d.target !== null ? chartValueLabel(indicatorType, d.target) : "—"}
          </p>
          <p className="text-sky-700">실적 {chartValueLabel(indicatorType, d.actual)}</p>
        </>
      )}
      {d.hasComment && d.description ? (
        <p className="mt-1 max-w-[220px] border-t border-sky-100 pt-1 text-[11px] leading-snug text-slate-500">
          {previewComment(d.description, 72)}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">코멘트 없음</p>
      )}
    </div>
  );
}

const CHART_BAR_LEGEND_FILL = "#0284c7";
const CHART_TARGET_LINE_STROKE = "#dc2626";

function legendDataKeyString(dataKey: unknown): string {
  if (typeof dataKey === "function") return "";
  if (dataKey === null || dataKey === undefined) return "";
  return String(dataKey);
}

/** 기본 Legend는 시리즈 색으로 글자색·막대 아이콘이 잡혀 보기 어려움 → 라벨은 검정, 실적 아이콘은 차트 막대색 */
function KpiComposedLegend({ payload }: RechartsLegendContentProps) {
  if (!payload?.length) return null;
  return (
    <ul className="flex list-none flex-wrap items-center justify-center gap-x-8 gap-y-1 pt-1 text-sm">
      {payload.map((entry) => {
        const dk = legendDataKeyString(entry.dataKey);
        const isTarget = dk === "target";
        const label = entry.value ?? "";
        return (
          <li key={`${dk}-${label}`} className="flex items-center gap-2">
            {isTarget ? (
              <span className="inline-flex shrink-0 items-center" aria-hidden>
                <svg width={28} height={10} viewBox="0 0 28 10">
                  <line
                    x1={1}
                    y1={5}
                    x2={27}
                    y2={5}
                    stroke={CHART_TARGET_LINE_STROKE}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                  <circle
                    cx={14}
                    cy={5}
                    r={3}
                    fill="#fff"
                    stroke={CHART_TARGET_LINE_STROKE}
                    strokeWidth={1.5}
                  />
                </svg>
              </span>
            ) : (
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: CHART_BAR_LEGEND_FILL }}
                aria-hidden
              />
            )}
            <span className="font-medium text-slate-900">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function KpiCommentBubbleLabel({
  x,
  y,
  width,
  value,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}) {
  if (typeof value !== "string" || !value.trim()) return null;
  const nx = Number(x);
  const ny = Number(y);
  const nw = Number(width);
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw)) {
    return null;
  }

  const label = previewComment(value, 14) ?? "";
  const boxWidth = Math.max(44, Math.min(96, label.length * 8 + 18));
  const anchorX = nx + nw / 2;
  const anchorY = ny;
  const boxX = anchorX + 16;
  const boxY = Math.max(0, anchorY - 34);
  const connectorY = boxY + 11;

  return (
    <g pointerEvents="none">
      <line
        x1={anchorX}
        y1={anchorY}
        x2={boxX}
        y2={connectorY}
        stroke="#f59e0b"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <circle cx={anchorX} cy={anchorY} r={2.5} fill="#f59e0b" />
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={22}
        rx={8}
        fill="#fef3c7"
        stroke="#f59e0b"
        strokeWidth={1}
      />
      <text
        x={boxX + boxWidth / 2}
        y={boxY + 14}
        textAnchor="middle"
        fill="#92400e"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

function KpiTargetBubbleLabel({
  x,
  y,
  value,
}: {
  x?: number | string;
  y?: number | string;
  value?: unknown;
}) {
  if (typeof value !== "string" || !value.trim()) return null;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return null;
  }

  const label = previewComment(value, 12) ?? "";
  const boxWidth = Math.max(42, Math.min(92, label.length * 8 + 18));
  const anchorX = nx;
  const anchorY = ny;
  const placeLeft = anchorX > boxWidth + 22;
  const boxX = placeLeft ? anchorX - boxWidth - 16 : anchorX + 16;
  const boxY = Math.max(0, anchorY - 36);
  const connectorY = boxY + 11;
  const pointerX = placeLeft ? boxX + boxWidth : boxX;

  return (
    <g pointerEvents="none">
      <line
        x1={anchorX}
        y1={anchorY}
        x2={pointerX}
        y2={connectorY}
        stroke="#dc2626"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <circle cx={anchorX} cy={anchorY} r={2.5} fill="#dc2626" />
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={22}
        rx={8}
        fill="#fee2e2"
        stroke="#dc2626"
        strokeWidth={1}
      />
      <text
        x={boxX + boxWidth / 2}
        y={boxY + 14}
        textAnchor="middle"
        fill="#991b1b"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
}

function chartValueLabel(indicatorType: KpiIndicatorType, value: number): string {
  if (indicatorType === "ppm") return `${formatKoMax2Decimals(value)} ppm`;
  if (indicatorType === "quantity") return `${formatKoMax2Decimals(value)} k`;
  if (indicatorType === "count") return `${formatKoMax2Decimals(value)} 건`;
  if (indicatorType === "headcount") return `${formatKoMax2Decimals(value)} 명`;
  if (indicatorType === "money") return `${formatKoMax2Decimals(value)}억`;
  if (indicatorType === "time") return `${formatKoMax2Decimals(value)} h`;
  if (indicatorType === "uph") return `${formatKoMax2Decimals(value)} UPH`;
  return formatKoPercentMax2(value);
}

function benchmarkLabel(indicatorType: KpiIndicatorType, raw: string): string {
  const parsed = parseBenchmarkValue(raw);
  return parsed !== null ? chartValueLabel(indicatorType, parsed) : raw;
}

type ChartYDomain = { min: number; max: number };

function niceAxisStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function centeredChartYDomain(
  values: number[],
  percentClamped: boolean,
  centerValue?: number | null
): ChartYDomain {
  const finiteValues = values.filter((v) => Number.isFinite(v));
  if (finiteValues.length === 0) {
    return { min: percentClamped ? -6 : -2, max: percentClamped ? 120 : 100 };
  }

  const rawMax = Math.max(...finiteValues);
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return { min: percentClamped ? -6 : -0.1, max: percentClamped ? 120 : 1 };
  }

  if (percentClamped) {
    return { min: -6, max: 120 };
  }

  const desiredTop =
    centerValue !== null &&
    centerValue !== undefined &&
    Number.isFinite(centerValue) &&
    centerValue > 0
      ? centerValue * 2
      : rawMax * 2;
  const step = niceAxisStep(desiredTop / 4);
  let max = Math.ceil(desiredTop / step) * step;

  if (max <= 0) {
    max = step;
  }

  return { min: -step * 0.25, max };
}

/** 차트 세로축 단위 안내 — % 그래프 설명과 혼동 방지 */
function chartVerticalAxisHint(
  t: KpiIndicatorType,
  opts?: { normalLinkedToTarget?: boolean }
): string {
  if (t === "normal") {
    if (opts?.normalLinkedToTarget) {
      return "세로축: 목표선·실적 막대는 같은 단위의 지표값(예 %p). 표시되는 달성률은 목표 대비 자동 계산값입니다.";
    }
    return "세로축: 달성률(%) 직접 입력 시 막대=달성률. 목표연동 입력 시 막대=실적 지표값.";
  }
  if (t === "ppm") return "세로축: PPM(목표·실적 동일 단위).";
  if (t === "quantity") return "세로축: 수량 k(천 단위).";
  if (t === "count") return "세로축: 건수.";
  if (t === "headcount") return "세로축: 인원(명).";
  if (t === "money") return "세로축: 금액(억).";
  if (t === "time") return "세로축: 시간(h).";
  if (t === "uph") return "세로축: 생산성(UPH).";
  return "";
}

function periodRangeLabel(start: number | null, end: number | null): string {
  if (!start || !end) return "레거시 기준";
  return `${formatAxisLabel(start as MonthKey)} ~ ${formatAxisLabel(end as MonthKey)}`;
}

export function PerformanceModal({
  isOpen,
  onClose,
  kpiItem,
  startMode,
  canEditPerformance = true,
  profileRole = null,
  canDeleteKpiItem = false,
  onDeleteKpiItem,
  canFinalizeKpiItem = false,
  onFinalizeKpiItem,
  onExtendPeriodEndMonth,
}: Props) {
  const perfQuery = useKpiPerformances(isOpen && kpiItem ? kpiItem.id : null);
  const saveMutation = useUpsertMonthPerformance();
  const workflowMut = useWorkflowReviewMutation();
  const [mode, setMode] = useState<"viewer" | "editor">("viewer");
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(1);
  const [editorMonth, setEditorMonth] = useState<MonthKey>(1);
  const [editorRate, setEditorRate] = useState("");
  const [editorActualPpm, setEditorActualPpm] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorBubbleNote, setEditorBubbleNote] = useState("");
  const [editorFiles, setEditorFiles] = useState<File[]>([]);
  const [editorAggregationType, setEditorAggregationType] =
    useState<KpiAggregationType>("monthly");
  const [uploading, setUploading] = useState(false);
  const [liveRows, setLiveRows] = useState<ItemPerformanceRow[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [downloadingEvidence, setDownloadingEvidence] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });

  const effectiveIndicatorType = useMemo(
    () =>
      kpiItem
        ? resolveEffectiveIndicatorTypeForUi(kpiItem.indicatorType, kpiItem.bm)
        : "normal",
    [kpiItem]
  );

  const computedTargetMetric = useMemo(
    () =>
      kpiItem
        ? resolveComputedTargetMetric(
            effectiveIndicatorType,
            kpiItem.targetPpm,
            kpiItem.targetFinalValue
          )
        : null,
    [kpiItem, effectiveIndicatorType]
  );

  const isComputedItem = kpiItem
    ? indicatorUsesComputedAchievement(effectiveIndicatorType) ||
      kpiItem.evaluationType === "qualitative"
    : false;

  const isAdmin = isAdminRole(profileRole);
  const normalizedRole = normalizeRole(profileRole);
  const isPrivilegedEditor =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader" ||
    normalizedRole === "group_team_leader";
  const canFinalComplete = canFinalizeKpiItem && isPrivilegedEditor;

  const activeMonthList = useMemo(() => {
    if (!kpiItem) return [] as MonthKey[];
    const startMonth = kpiItem.periodStartMonth;
    const endMonth = kpiItem.periodEndMonth;
    if (
      startMonth !== null &&
      endMonth !== null &&
      Number.isInteger(startMonth) &&
      Number.isInteger(endMonth) &&
      startMonth >= 1 &&
      endMonth <= 15 &&
      startMonth <= endMonth
    ) {
      const months: MonthKey[] = [];
      for (let m = startMonth; m <= endMonth; m += 1) {
        months.push(m as MonthKey);
      }
      return months;
    }
    const sched = scheduleMonthsFromItemDates(
      kpiItem.h1TargetDate,
      kpiItem.h2TargetDate
    );
    return activeMonthsForSchedule(sched);
  }, [
    kpiItem?.h1TargetDate,
    kpiItem?.h2TargetDate,
    kpiItem?.periodStartMonth,
    kpiItem?.periodEndMonth,
  ]);

  const displayMonthList = useMemo(() => {
    if (!kpiItem || activeMonthList.length === 0) return [] as MonthKey[];
    return activeMonthList;
  }, [kpiItem, activeMonthList]);

  const activeSet = useMemo(
    () => new Set<MonthKey>(displayMonthList),
    [displayMonthList]
  );

  const normalMonthlyContext = useMemo((): NormalMonthlyTargetContext | null => {
    if (!kpiItem || activeMonthList.length === 0) return null;
    return {
      activeFirstMonth: activeMonthList[0]!,
      activeLastMonth: activeMonthList[activeMonthList.length - 1]!,
      periodStartMonth: kpiItem.periodStartMonth,
      periodEndMonth: kpiItem.periodEndMonth,
      firstHalfTarget: kpiItem.firstHalfTarget,
      firstHalfRate: kpiItem.firstHalfRate,
      secondHalfTarget: kpiItem.secondHalfTarget,
      secondHalfRate: kpiItem.secondHalfRate,
      targetFinalValue: kpiItem.targetFinalValue,
      challengeTarget: kpiItem.challengeTarget,
      targetDirection: kpiItem.targetDirection,
    };
  }, [kpiItem, activeMonthList]);

  const rowByMonth = useMemo(() => {
    const m = new Map<MonthKey, ItemPerformanceRow>();
    for (const r of liveRows) {
      const mk = halfTypeLabelToMonth(r.half_type);
      if (mk !== null && !m.has(mk)) m.set(mk, r);
    }
    return m;
  }, [liveRows]);

  const normalMonthlyTargetEditor = useMemo(() => {
    if (
      effectiveIndicatorType !== "normal" ||
      !normalMonthlyContext ||
      !kpiItem ||
      kpiItem.targetDirection === "na"
    ) {
      return null;
    }
    const monthlyMap = kpiItem.monthlyTargets ?? {};
    if (editorAggregationType === "cumulative") {
      return (
        cumulativeTargetThroughMonth(monthlyMap, editorMonth) ??
        resolveNormalMonthlyTargetMetric(editorMonth, normalMonthlyContext)
      );
    }
    const fromMap = resolveMonthlyTargetForMonth(
      monthlyMap,
      editorMonth,
      kpiItem.targetFillPolicy
    );
    const t =
      typeof fromMap === "number" && Number.isFinite(fromMap)
        ? fromMap
        : resolveNormalMonthlyTargetMetric(editorMonth, normalMonthlyContext);
    return t >= 0 ? t : null;
  }, [effectiveIndicatorType, normalMonthlyContext, editorMonth, kpiItem, editorAggregationType]);

  const computedMonthlyTargetEditor = useMemo(() => {
    if (!isComputedItem || !kpiItem) return null;
    if (editorAggregationType === "cumulative") {
      return (
        cumulativeTargetThroughMonth(kpiItem.monthlyTargets, editorMonth) ??
        computedTargetMetric
      );
    }
    const fromMonthly = resolveMonthlyTargetForMonth(
      kpiItem.monthlyTargets,
      editorMonth,
      kpiItem.targetFillPolicy
    );
    if (fromMonthly !== null) return fromMonthly;
    return computedTargetMetric;
  }, [isComputedItem, kpiItem, editorMonth, computedTargetMetric, editorAggregationType]);

  const displayedFinalTargetValue = useMemo(() => {
    if (!kpiItem) return null;
    if (kpiItem.aggregationType === "cumulative") {
      const values = Object.values(kpiItem.monthlyTargets ?? {}).filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v)
      );
      if (values.length > 0) {
        return values.reduce((sum, value) => sum + value, 0);
      }
    }
    return kpiItem.targetFinalValue;
  }, [kpiItem]);

  const normalMetricEntryActive = Boolean(
    effectiveIndicatorType === "normal" &&
      kpiItem &&
      kpiItem.targetDirection !== "na" &&
      normalMonthlyTargetEditor !== null &&
      normalMonthlyTargetEditor >= 0
  );

  const computedEditorPreviewPercent = useMemo(() => {
    if (
      isComputedItem &&
      kpiItem &&
      computedMonthlyTargetEditor !== null &&
      computedMonthlyTargetEditor >= 0
    ) {
      const ap = parseNonNegativeDecimal(editorActualPpm);
      if (ap === null) return null;
      const actualForAchievement =
        editorAggregationType === "cumulative"
          ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, editorMonth) + ap
          : ap;
      if (kpiItem.evaluationType === "qualitative") {
        return qualitativeAchievementPercent(
          actualForAchievement,
          computedMonthlyTargetEditor,
          kpiItem.qualitativeCalcType ?? "progress",
          kpiItem.achievementCap
        );
      }
      return computedAchievementPercent(
        effectiveIndicatorType,
        actualForAchievement,
        computedMonthlyTargetEditor,
        kpiItem.targetDirection,
        kpiItem.achievementCap
      );
    }
    if (
      normalMetricEntryActive &&
      kpiItem &&
      normalMonthlyTargetEditor !== null &&
      normalMonthlyTargetEditor >= 0
    ) {
      const ap = parseNonNegativeDecimal(editorRate);
      if (ap === null) return null;
      const actualForAchievement =
        editorAggregationType === "cumulative"
          ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, editorMonth) + ap
          : ap;
      return computedAchievementPercent(
        "normal",
        actualForAchievement,
        normalMonthlyTargetEditor,
        kpiItem.targetDirection,
        kpiItem.achievementCap
      );
    }
    return null;
  }, [
    isComputedItem,
    kpiItem,
    computedMonthlyTargetEditor,
    editorActualPpm,
    effectiveIndicatorType,
    normalMetricEntryActive,
    normalMonthlyTargetEditor,
    editorRate,
    editorAggregationType,
    rowByMonth,
    displayMonthList,
    editorMonth,
  ]);

  const normalLinkedToTargetChart =
    effectiveIndicatorType === "normal" &&
    Boolean(kpiItem && kpiItem.targetDirection !== "na");

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const effectiveMode =
      canEditPerformance ? startMode : "viewer";
    setMode(effectiveMode);
    const firstActive = activeMonthList[0] ?? KPI_MONTHS[0]!;
    setSelectedMonth(firstActive);
    setEditorMonth(firstActive);
  }, [isOpen, kpiItem, startMode, canEditPerformance, activeMonthList]);

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const rows = perfQuery.data ?? [];
    setLiveRows(rows);
  }, [isOpen, kpiItem, perfQuery.data]);

  useEffect(() => {
    if (!isOpen || !kpiItem || activeMonthList.length === 0) return;
    if (!activeSet.has(selectedMonth)) {
      const first = activeMonthList[0]!;
      setSelectedMonth(first);
      setEditorMonth(first);
    }
  }, [isOpen, kpiItem, activeMonthList, activeSet, selectedMonth]);

  useEffect(() => {
    if (isOpen) return;
    setRejectModalOpen(false);
    setRejectReasonDraft("");
  }, [isOpen]);

  const chartData: ChartDatum[] = useMemo(() => {
    if (!kpiItem) return [];
    const series: ChartDatum[] = displayMonthList.map((m) => {
      const row = rowByMonth.get(m);
      const copied = row
        ? null
        : findLatestPriorRowWithSubmittedValue(rowByMonth, m, displayMonthList);
      const sourceRow = row ?? copied?.row ?? null;
      const visibleOnChart =
        row !== undefined
          ? isChartVisibleStep(row?.approval_step ?? null)
          : copied !== null;
      const rawSubmitted =
        sourceRow?.achievement_rate !== null &&
        sourceRow?.achievement_rate !== undefined &&
        !Number.isNaN(Number(sourceRow.achievement_rate))
          ? Number(sourceRow.achievement_rate)
          : null;
      const rawActualMetric =
        sourceRow?.actual_value !== null &&
        sourceRow?.actual_value !== undefined &&
        Number.isFinite(Number(sourceRow.actual_value))
          ? Number(sourceRow.actual_value)
          : null;
      const monthlyTargetMap = kpiItem.monthlyTargets ?? {};
      const hasMonthlyTargetPlan = Object.keys(monthlyTargetMap).length > 0;
      const rowAggregationType = resolvePerformanceAggregationType(
        row,
        kpiItem.aggregationType
      );
      const monthTargetNormal =
        effectiveIndicatorType === "normal"
          ? (() => {
              if (rowAggregationType === "cumulative") {
                return (
                  cumulativeTargetThroughMonth(monthlyTargetMap, m) ??
                  (normalMonthlyContext
                    ? resolveNormalMonthlyTargetMetric(m, normalMonthlyContext)
                    : 0)
                );
              }
              const fromMap = resolveMonthlyTargetForMonth(
                monthlyTargetMap,
                m,
                kpiItem.targetFillPolicy
              );
              if (fromMap !== null) {
                return fromMap;
              }
              if (hasMonthlyTargetPlan) {
                return null;
              }
              return normalMonthlyContext
                ? resolveNormalMonthlyTargetMetric(m, normalMonthlyContext)
                : 0;
            })()
          : null;
      const monthTargetComputed =
        indicatorUsesComputedAchievement(effectiveIndicatorType)
          ? (() => {
              if (rowAggregationType === "cumulative") {
                return cumulativeTargetThroughMonth(monthlyTargetMap, m) ?? computedTargetMetric ?? 0;
              }
              const fromMonthly = resolveMonthlyTargetForMonth(
                kpiItem.monthlyTargets,
                m,
                kpiItem.targetFillPolicy
              );
              if (fromMonthly !== null) return fromMonthly;
              if (hasMonthlyTargetPlan) {
                return null;
              }
              return computedTargetMetric ?? 0;
            })()
          : null;
      const normalRowMetricMode =
        effectiveIndicatorType === "normal" &&
        kpiItem.targetDirection !== "na" &&
        monthTargetNormal !== null &&
        monthTargetNormal >= 0;

      let actual: number;
      if (indicatorUsesComputedAchievement(effectiveIndicatorType)) {
        actual =
          visibleOnChart && rawActualMetric !== null
            ? rowAggregationType === "cumulative"
              ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, m) +
                rawActualMetric
              : rawActualMetric
            : 0;
      } else if (normalRowMetricMode) {
        if (rawActualMetric !== null) {
          actual = visibleOnChart
            ? rowAggregationType === "cumulative"
              ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, m) +
                rawActualMetric
              : rawActualMetric
            : 0;
        } else {
          actual =
            visibleOnChart && rawSubmitted !== null ? rawSubmitted : 0;
        }
      } else {
        actual =
          visibleOnChart && rawSubmitted !== null ? rawSubmitted : 0;
      }

      const description = row?.description ?? null;
      const bubbleNote = row?.bubble_note ?? null;
      const targetNote = kpiItem.monthlyTargetNotes?.[m] ?? null;

      let target: number | null;
      if (indicatorUsesComputedAchievement(effectiveIndicatorType)) {
        target = monthTargetComputed;
      } else if (effectiveIndicatorType === "normal") {
        target = monthTargetNormal;
      } else {
        target = 0;
      }

      let submittedPercent = rawSubmitted;
      if (row !== undefined && rawActualMetric !== null && target !== null && target >= 0) {
        const actualForAchievement =
          rowAggregationType === "cumulative"
            ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, m) +
              rawActualMetric
            : rawActualMetric;
        if (kpiItem.evaluationType === "qualitative") {
          submittedPercent = qualitativeAchievementPercent(
            actualForAchievement,
            target,
            kpiItem.qualitativeCalcType ?? "progress",
            kpiItem.achievementCap
          );
        } else if (
          indicatorUsesComputedAchievement(effectiveIndicatorType) ||
          normalRowMetricMode
        ) {
          submittedPercent = computedAchievementPercent(
            effectiveIndicatorType,
            actualForAchievement,
            target,
            kpiItem.targetDirection,
            kpiItem.achievementCap
          );
        }
      }

      const showBarTopLabel =
        visibleOnChart ||
        monthHasSubmittedPerformanceInput(
          effectiveIndicatorType,
          row,
          rawSubmitted
        );
      const topLabel = chartBarTopLabel(
        effectiveIndicatorType,
        sourceRow ?? undefined,
        showBarTopLabel,
        rawSubmitted
      );
      return {
        periodLabel: formatAxisLabel(m),
        month: m,
        target,
        actual,
        submittedPercent,
        description,
        bubbleNote,
        evidence_url: row?.evidence_url ?? null,
        hasComment: Boolean(description?.trim()),
        challengeMet:
          submittedPercent !== null &&
          kpiItem.challengeTarget !== null &&
          kpiItem.challengeTarget !== undefined &&
          submittedPercent >= kpiItem.challengeTarget,
        ...(copied ? { copiedFromMonth: copied.month } : {}),
        ...(topLabel ? { barTopLabel: topLabel } : {}),
        ...(bubbleNote?.trim() ? { commentLabel: bubbleNote } : {}),
        ...(targetNote?.trim() ? { targetNoteLabel: targetNote } : {}),
      };
    });
    const benchmarkNumber = parseBenchmarkValue(kpiItem.bm);
    const benchmarkBarValue =
      benchmarkNumber ??
      (displayedFinalTargetValue !== null &&
      displayedFinalTargetValue !== undefined &&
      Number.isFinite(displayedFinalTargetValue)
        ? displayedFinalTargetValue
        : 0);
    const benchmarkRow: ChartDatum | null =
      kpiItem.bm && kpiItem.bm !== "-"
        ? {
            periodLabel: "B/M",
            month: 0,
            target: null,
            actual: benchmarkBarValue,
            submittedPercent: null,
            description: "전년실적 또는 벤치마크 기준",
            bubbleNote: null,
            evidence_url: null,
            hasComment: false,
            challengeMet: false,
            isBenchmark: true,
            barTopLabel: benchmarkLabel(effectiveIndicatorType, kpiItem.bm),
          }
        : null;
    return benchmarkRow ? [benchmarkRow, ...series] : series;
  }, [
    kpiItem,
    rowByMonth,
    displayMonthList,
    effectiveIndicatorType,
    computedTargetMetric,
    normalMonthlyContext,
    displayedFinalTargetValue,
  ]);

  const chartYDomain = useMemo((): ChartYDomain => {
    if (!kpiItem) return { min: 0, max: 100 };
    const normalMetricYAxis =
      effectiveIndicatorType === "normal" && kpiItem.targetDirection !== "na";
    const higherNormalPercentYAxis =
      effectiveIndicatorType === "normal" && kpiItem.targetDirection !== "down";
    const percentClamped =
      !indicatorUsesComputedAchievement(effectiveIndicatorType) &&
      (!normalMetricYAxis || higherNormalPercentYAxis);
    const targetValues = chartData
      .filter((d) => !d.isBenchmark && d.target !== null && Number.isFinite(d.target))
      .map((d) => d.target as number);
    const lowerTargetCenter =
      kpiItem.targetDirection === "down" && targetValues.length > 0
        ? Math.max(...targetValues)
        : null;
    const values: number[] = [];

    for (const d of chartData) {
      if (d.target !== null && Number.isFinite(d.target) && d.target !== 0) {
        values.push(d.target);
      }
      if ((d.isBenchmark || d.barTopLabel || d.actual !== 0) && Number.isFinite(d.actual)) {
        values.push(d.actual);
      }
    }

    return centeredChartYDomain(values, percentClamped, lowerTargetCenter);
  }, [kpiItem, chartData, effectiveIndicatorType]);

  const hasTargetNoteLabels = useMemo(
    () =>
      chartData.some(
        (d) => typeof d.targetNoteLabel === "string" && d.targetNoteLabel.trim()
      ),
    [chartData]
  );
  const hidePercentHeadroomTick =
    effectiveIndicatorType === "normal" && kpiItem?.targetDirection !== "down";

  const selectedRow = rowByMonth.get(selectedMonth) ?? null;
  const selectedChartDatum =
    chartData.find((d) => d.month === selectedMonth && !d.isBenchmark) ?? null;
  const selectedSubmittedPercent = selectedChartDatum?.submittedPercent ?? null;
  const selectedAggregationType = resolvePerformanceAggregationType(
    selectedRow,
    kpiItem?.aggregationType
  );
  const chartActualSelected =
    chartData.find((d) => d.month === selectedMonth && !d.isBenchmark)?.actual ?? 0;
  const selectedDescription = selectedRow?.description ?? null;
  const selectedEvidenceStored =
    selectedRow?.evidence_path ??
    selectedRow?.evidence_url ??
    null;
  const selectedEvidenceItems = (
    selectedRow?.evidence_paths?.length
      ? selectedRow.evidence_paths
      : selectedRow?.evidence_urls?.length
        ? selectedRow.evidence_urls
        : selectedEvidenceStored
          ? [selectedEvidenceStored]
          : []
  )
    .map((storedValue) => ({
      storedValue,
      path: evidencePathFromStoredValue(storedValue),
      fileName: evidenceFileNameFromStoredValue(storedValue),
    }))
    .filter((item) => Boolean(item.path));
  const selectedStatus = selectedRow?.approval_step ?? null;
  const selectedRejectionReason = selectedRow?.rejection_reason ?? null;
  const selectedMonthWritableByWriter = !monthLockedForEditor(
    selectedStatus,
    isPrivilegedEditor
  );
  const canOpenRegister = canEditPerformance;
  const canOpenModify = isPrivilegedEditor && canEditPerformance;
  const writerLockedNow =
    !isPrivilegedEditor && isWriterPerformanceLockedByStep(selectedStatus);

  const notify = useCallback((tone: ToastState["tone"], message: string) => {
    setToast({ open: true, message, tone });
  }, []);

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 1000);
    return () => clearTimeout(t);
  }, [toast.open]);

  async function handleDownloadEvidence(storedValue: string) {
    if (!storedValue) {
      notify("info", "보고서가 없습니다.");
      return;
    }
    try {
      setDownloadingEvidence(true);
      const downloadableUrl = resolveEvidencePublicUrl(storedValue);
      if (!downloadableUrl) {
        throw new Error("다운로드 가능한 파일 주소를 생성하지 못했습니다.");
      }
      window.open(downloadableUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadingEvidence(false);
    }
  }

  const workflowPrimaryVisible = useMemo(() => {
    if (!profileRole || !selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    return (
      canGroupLeaderApprove(profileRole) &&
      (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING)
    );
  }, [profileRole, selectedRow?.id, selectedStatus]);

  const workflowFinalVisible = useMemo(() => {
    if (!profileRole || !selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    return (
      canTeamLeaderFinalApprove(profileRole) && st === PERF_STATUS_PENDING_FINAL
    );
  }, [profileRole, selectedRow?.id, selectedStatus]);

  const editorRow = findRowByMonth(liveRows, editorMonth);
  const editorMonthLocked = monthLockedForEditor(
    editorRow?.approval_step,
    isPrivilegedEditor
  );
  const editorHasStoredEvidence = Boolean(
    editorRow?.evidence_paths?.some((path) => path.trim()) ||
      (editorRow?.evidence_path?.trim() ?? "") ||
      (editorRow?.evidence_url?.trim() ?? "")
  );
  /** 관리자는 증빙 없이 저장 가능 */
  const editorHasEvidenceForSave =
    isAdmin || editorFiles.length > 0 || editorHasStoredEvidence;

  const syncEditorFromMonth = useCallback(
    (mo: MonthKey) => {
      const row = findRowByMonth(liveRows, mo);
      const copied = row
        ? null
        : findLatestPriorRowWithSubmittedValue(rowByMonth, mo, displayMonthList);
      const sourceRow = row ?? copied?.row ?? null;
      if (normalMetricEntryActive) {
        setEditorRate(
          sourceRow?.actual_value !== null && sourceRow?.actual_value !== undefined
            ? String(sourceRow.actual_value)
            : ""
        );
      } else {
        setEditorRate(
          sourceRow?.achievement_rate !== null && sourceRow?.achievement_rate !== undefined
            ? String(sourceRow.achievement_rate)
            : ""
        );
      }
      setEditorActualPpm(
        sourceRow?.actual_value !== null && sourceRow?.actual_value !== undefined
          ? String(sourceRow.actual_value)
          : ""
      );
      setEditorDescription(row?.description ?? "");
      setEditorBubbleNote(row?.bubble_note ?? "");
      setEditorAggregationType(
        resolvePerformanceAggregationType(row, kpiItem?.aggregationType)
      );
      setEditorFiles([]);
    },
    [liveRows, normalMetricEntryActive, rowByMonth, displayMonthList, kpiItem?.aggregationType]
  );

  useEffect(() => {
    if (mode !== "editor") return;
    syncEditorFromMonth(editorMonth);
  }, [mode, editorMonth, liveRows, syncEditorFromMonth]);

  if (!isOpen || !kpiItem) return null;
  const item = kpiItem;
  const currentPeriodEndMonth =
    item.periodEndMonth ?? activeMonthList[activeMonthList.length - 1] ?? 12;
  const nextDelayMonth =
    currentPeriodEndMonth < 15 ? ((currentPeriodEndMonth + 1) as MonthKey) : null;
  const canAddDelayMonth =
    canFinalComplete &&
    !item.isFinalCompleted &&
    nextDelayMonth !== null &&
    typeof onExtendPeriodEndMonth === "function";

  async function handleExtendDelayMonth() {
    if (!nextDelayMonth || !onExtendPeriodEndMonth) return;
    const ok = await onExtendPeriodEndMonth(item.id);
    if (!ok) return;
    setSelectedMonth(nextDelayMonth);
    setEditorMonth(nextDelayMonth);
  }

  function buildFollowingCumulativeRateUpdates(
    currentActualValue: number | undefined
  ): Array<{ month: MonthKey; achievementRate: number }> {
    if (currentActualValue === undefined || !normalMonthlyContext) return [];
    const updates: Array<{ month: MonthKey; achievementRate: number }> = [];
    const actualThroughMonth = (targetMonth: MonthKey) =>
      displayMonthList.reduce((sum, month) => {
        if (month > targetMonth) return sum;
        const raw =
          month === editorMonth
            ? currentActualValue
            : rowByMonth.get(month)?.actual_value;
        const value =
          raw !== null && raw !== undefined && Number.isFinite(Number(raw))
            ? Number(raw)
            : 0;
        return sum + value;
      }, 0);

    for (const month of displayMonthList) {
      if (month <= editorMonth) continue;
      const row = rowByMonth.get(month);
      if (resolvePerformanceAggregationType(row, item.aggregationType) !== "cumulative") {
        continue;
      }
      const ownActual = row?.actual_value;
      if (
        ownActual === null ||
        ownActual === undefined ||
        !Number.isFinite(Number(ownActual))
      ) {
        continue;
      }

      const actual = actualThroughMonth(month);
      let target: number | null = null;
      let rate: number | null = null;
      if (indicatorUsesComputedAchievement(effectiveIndicatorType)) {
        target =
          cumulativeTargetThroughMonth(item.monthlyTargets, month) ??
          computedTargetMetric;
        if (target !== null && target >= 0) {
          rate =
            item.evaluationType === "qualitative"
              ? qualitativeAchievementPercent(
                  actual,
                  target,
                  item.qualitativeCalcType ?? "progress",
                  item.achievementCap
                )
              : computedAchievementPercent(
                  effectiveIndicatorType,
                  actual,
                  target,
                  item.targetDirection,
                  item.achievementCap
                );
        }
      } else if (effectiveIndicatorType === "normal" && item.targetDirection !== "na") {
        target =
          cumulativeTargetThroughMonth(item.monthlyTargets, month) ??
          resolveNormalMonthlyTargetMetric(month, normalMonthlyContext);
        if (target !== null && target >= 0) {
          rate = computedAchievementPercent(
            "normal",
            actual,
            target,
            item.targetDirection,
            item.achievementCap
          );
        }
      }
      if (rate !== null && Number.isFinite(rate)) {
        updates.push({ month, achievementRate: rate });
      }
    }
    return updates;
  }

  async function handleSaveMonth(options?: { finalizeAfterSave?: boolean }) {
    if (!activeSet.has(editorMonth)) {
      notify("error", "해당 월은 프로젝트 기간에 포함되지 않습니다.");
      return;
    }
    if (editorMonthLocked) {
      notify(
        "error",
        "승인 대기 중이거나 승인 완료된 월은 그룹장·팀장·관리자만 수정할 수 있습니다."
      );
      return;
    }
    const isComputed = indicatorUsesComputedAchievement(effectiveIndicatorType);
    let rateNum: number;
    let actualMetricSave: number | undefined;
    if (isComputed) {
      if (computedMonthlyTargetEditor === null || computedMonthlyTargetEditor < 0) {
        notify(
          "error",
          `${computedKindSummaryKo(effectiveIndicatorType)} 항목에는 해당 월의 목표값이 필요합니다. 월별 목표값을 확인해 주세요.`
        );
        return;
      }
      const ap = parseNonNegativeDecimal(editorActualPpm);
      if (ap === null) {
        notify(
          "error",
          `${computedActualLabel(effectiveIndicatorType)}을(를) 입력해 주세요.`
        );
        return;
      }
      actualMetricSave = ap;
      const actualForAchievement =
        editorAggregationType === "cumulative"
          ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, editorMonth) + ap
          : ap;
      rateNum =
        item.evaluationType === "qualitative"
          ? qualitativeAchievementPercent(
              actualForAchievement,
              computedMonthlyTargetEditor,
              item.qualitativeCalcType ?? "progress",
              item.achievementCap
            )
          : computedAchievementPercent(
              effectiveIndicatorType,
              actualForAchievement,
              computedMonthlyTargetEditor,
              item.targetDirection,
              item.achievementCap
            );
    } else if (
      normalMetricEntryActive &&
      normalMonthlyTargetEditor !== null &&
      normalMonthlyTargetEditor >= 0
    ) {
      const metric = parseNonNegativeDecimal(editorRate);
      if (metric === null) {
        notify("error", "해당 월의 실적 지표값을 입력해 주세요.");
        return;
      }
      actualMetricSave = metric;
      const actualForAchievement =
        editorAggregationType === "cumulative"
          ? cumulativeActualThroughPriorMonths(rowByMonth, displayMonthList, editorMonth) + metric
          : metric;
      rateNum = computedAchievementPercent(
        "normal",
        actualForAchievement,
        normalMonthlyTargetEditor,
        item.targetDirection,
        item.achievementCap
      );
    } else {
      if (!editorRate.trim()) {
        notify("error", "달성률(%)을 입력해 주세요.");
        return;
      }
      const n = toNumber(editorRate);
      if (n === null) {
        notify("error", "달성률(%)을 입력해 주세요.");
        return;
      }
      rateNum = n;
    }
    if (!editorHasEvidenceForSave) {
      notify("error", "증빙 파일을 첨부해야 실적을 등록할 수 있습니다.");
      return;
    }
    try {
      const saveResult = await saveMutation.mutateAsync({
        kpiId: item.id,
        month: editorMonth,
        achievement_rate: rateNum,
        description: editorDescription,
        bubbleNote: editorBubbleNote,
        indicatorMode: isComputed ? effectiveIndicatorType : "normal",
        achievementCap: item.achievementCap,
        ...(actualMetricSave !== undefined
          ? { actualValue: actualMetricSave }
          : {}),
        aggregationType: editorAggregationType,
        ...(isAdmin ? { adminBypassApprovalLock: true } : {}),
        actorRole: profileRole ?? null,
      });
      const targetId =
        saveResult && typeof saveResult.targetId === "string"
          ? saveResult.targetId
          : "";

      if (editorFiles.length > 0) {
        if (!targetId) {
          console.error("[KPI upload] upsert 후 targetId 누락", {
            kpiId: item.id,
            month: editorMonth,
          });
          throw new Error(
            "실적 정보 생성 중입니다. 잠시 대기 후 다시 시도해 주세요."
          );
        }
        setUploading(true);
        const uploadedPaths: string[] = [];
        for (const file of editorFiles) {
          const uploaded = await uploadEvidenceFile(
            targetId,
            file,
            `m${editorMonth}`
          );
          uploadedPaths.push(uploaded.fullPath);
        }
        await updatePerformanceMonthlyEvidenceUrl({
          targetId,
          month: editorMonth,
          evidenceUrls: uploadedPaths,
        });
      }

      const followingRateUpdates =
        buildFollowingCumulativeRateUpdates(actualMetricSave);
      if (followingRateUpdates.length > 0) {
        if (!targetId) {
          throw new Error(
            "누적 계산 재반영 중 실적 ID를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
        }
        await updatePerformanceMonthlyCalculatedRates({
          targetId,
          updates: followingRateUpdates,
        });
      }

      let finalized = false;
      if (options?.finalizeAfterSave) {
        if (!canFinalComplete || !onFinalizeKpiItem || item.isFinalCompleted) {
          notify("error", "최종 완료 처리 권한이 없거나 이미 완료된 항목입니다.");
          return;
        }
        finalized = await onFinalizeKpiItem(item.id, true);
      }

      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      setEditorFiles([]);
      const normalizedActor = normalizeRole(profileRole);
      notify(
        "success",
        finalized
          ? `${editorMonth}월 실적 저장 및 최종 완료 처리가 완료되었습니다.`
          : normalizedActor === "team_leader" || normalizedActor === "group_team_leader"
          ? `${editorMonth}월 실적이 저장되었습니다. (상태: 승인 완료 — 즉시 반영)`
          : normalizedActor === "group_leader"
            ? `${editorMonth}월 실적이 저장되었습니다. (상태: 최종 승인 대기 — 팀장 검토)`
            : `${editorMonth}월 실적이 저장되었습니다. (상태: 1차 승인 대기 — 그룹장 검토)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 실패";
      notify("error", message);
    } finally {
      setUploading(false);
    }
  }

  async function handleModalApprovePrimary() {
    const rid = selectedRow?.id;
    if (!rid) return;
    const hasMonthly = await getKpiTargetsHasPerformanceMonthlyColumn();
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "approve_primary",
        ...(hasMonthly ? { month: selectedMonth } : {}),
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      notify("success", "1차 승인되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "1차 승인에 실패했습니다.");
    }
  }

  async function handleModalApproveFinal() {
    const rid = selectedRow?.id;
    if (!rid) return;
    const hasMonthly = await getKpiTargetsHasPerformanceMonthlyColumn();
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "approve_final",
        ...(hasMonthly ? { month: selectedMonth } : {}),
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      notify("success", "최종 승인되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "최종 승인에 실패했습니다.");
    }
  }

  function openRejectModal() {
    const rid = selectedRow?.id;
    if (!rid) {
      notify(
        "error",
        "선택한 월에 연결된 실적 행이 없습니다. 실적을 먼저 저장해 주세요."
      );
      return;
    }
    setRejectReasonDraft("");
    setRejectModalOpen(true);
  }

  async function submitRejectFromModal() {
    const rid = selectedRow?.id;
    if (!rid) return;
    const reason = rejectReasonDraft.trim();
    if (!reason) {
      notify("error", "반려 사유를 입력해 주세요.");
      return;
    }
    const hasMonthly = await getKpiTargetsHasPerformanceMonthlyColumn();
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "reject",
        rejectionReason: reason,
        ...(hasMonthly ? { month: selectedMonth } : {}),
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      setRejectModalOpen(false);
      setRejectReasonDraft("");
      notify("success", "반려 처리되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "반려 처리에 실패했습니다.");
    }
  }

  async function handleDeleteKpiItemInModal() {
    if (!kpiItem || !canDeleteKpiItem || !onDeleteKpiItem) return;
    await onDeleteKpiItem(kpiItem.id);
    onClose();
  }

  async function handleWithdrawFinalCompletionInModal() {
    if (!kpiItem || !canFinalComplete || !onFinalizeKpiItem) return;
    const ok = await onFinalizeKpiItem(kpiItem.id, false);
    if (!ok) return;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3">
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
      <div className="relative flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl shadow-sky-200/50">
        <div className="shrink-0 border-b border-sky-100 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                세부활동
              </p>
              <h3 className="mt-1.5 text-lg font-bold leading-snug tracking-tight sm:text-xl">
                {item.detailActivity?.trim() ? item.detailActivity : "—"}
              </h3>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-sky-100/95">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5">
                  <Eye className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  KPI 뷰어
                </span>
                {item.isFinalCompleted ? (
                  <>
                    <span className="text-sky-100/80">·</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/25 px-2 py-0.5 text-emerald-50">
                      최종 완료
                    </span>
                  </>
                ) : null}
                <span className="text-sky-100/80">·</span>
                <span className="truncate text-sky-50/95" title={`${item.mainTopic} · ${item.subTopic}`}>
                  {item.mainTopic} · {item.subTopic}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canOpenRegister ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditorMonth(selectedMonth);
                    setMode("editor");
                  }}
                  disabled={writerLockedNow || (!isPrivilegedEditor && !selectedMonthWritableByWriter)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800 shadow-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FilePenLine className="h-3.5 w-3.5" />
                  실적 등록
                </button>
              ) : null}
              {canOpenModify ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditorMonth(selectedMonth);
                    setMode("editor");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/60 bg-sky-700/80 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  <FilePenLine className="h-3.5 w-3.5" />
                  실적 수정
                </button>
              ) : null}
              {canDeleteKpiItem ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteKpiItemInModal()}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
                >
                  삭제
                </button>
              ) : null}
              {canFinalComplete && item.isFinalCompleted ? (
                <button
                  type="button"
                  onClick={() => void handleWithdrawFinalCompletionInModal()}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-700 shadow-sm hover:bg-amber-50"
                >
                  최종 철회
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-white/90 hover:bg-white/10"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">

          <div className="mb-4 rounded-xl border border-sky-100 bg-white p-4">
            {item.needsStructureReview ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                KPI 평가 구조가 Rev02 이전 형식입니다. 수정 화면에서 평가 유형, 단위, 계산 기준, 목표 공백 처리, 달성률 상한을 확인해 저장해 주세요.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">평가 유형</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {item.evaluationType === "qualitative" ? "정성 평가" : "정량 평가"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">B/M</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {item.bm ? benchmarkLabel(effectiveIndicatorType, item.bm) : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">평가 기간</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {periodRangeLabel(item.periodStartMonth, item.periodEndMonth)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">최종 목표값</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {displayedFinalTargetValue !== null &&
                  displayedFinalTargetValue !== undefined
                    ? chartValueLabel(effectiveIndicatorType, displayedFinalTargetValue)
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">가중치</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {item.weight || "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">담당자</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {item.owner || "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="h-[320px] rounded-xl border border-sky-100 bg-white p-2 sm:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                accessibilityLayer={false}
                style={{ outline: "none" }}
                margin={{ top: 24, right: 16, left: 4, bottom: 8 }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (typeof label !== "string") return;
                  const hit = chartData.find((d) => d.periodLabel === label);
                  if (hit?.month !== null && hit?.month !== undefined && hit.month !== 0) {
                    setSelectedMonth(hit.month);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis
                  dataKey="periodLabel"
                  axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                  tickLine={{ stroke: "#94a3b8" }}
                  tickMargin={8}
                  tick={{ fill: "#334155", fontSize: 11 }}
                />
                <YAxis
                  domain={[chartYDomain.min, chartYDomain.max]}
                  allowDataOverflow
                  ticks={hidePercentHeadroomTick ? [20, 40, 60, 80, 100] : undefined}
                  tickFormatter={(v) => {
                    const numeric = typeof v === "number" ? v : Number(v);
                    if (numeric < 0) return "";
                    if (hidePercentHeadroomTick && numeric > 100) return "";
                    return chartValueLabel(effectiveIndicatorType, numeric);
                  }}
                  axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                  tickLine={{ stroke: "#94a3b8" }}
                  tickMargin={6}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                />
                <Tooltip content={<KpiChartTooltip indicatorType={effectiveIndicatorType} />} />
                <Legend content={KpiComposedLegend} />
                <ReferenceLine y={0} stroke="#dbeafe" strokeDasharray="3 3" strokeWidth={1} />
                <Bar
                  dataKey="actual"
                  name="실적"
                  fill={CHART_BAR_LEGEND_FILL}
                  activeBar={false}
                  maxBarSize={44}
                  radius={[6, 6, 0, 0]}
                  minPointSize={(value, index) => {
                    const d = chartData[index];
                    if (!d?.barTopLabel) return 0;
                    const v = Number(value);
                    if (!Number.isFinite(v) || v !== 0) return 0;
                    return 6;
                  }}
                  onClick={(data: unknown) => {
                    const row = data as ChartDatum | undefined;
                    if (!row || row.month === 0) return;
                    setSelectedMonth(row.month);
                  }}
                >
                  {chartData.map((entry) => {
                    const isSel = entry.month === selectedMonth;
                    return (
                      <Cell
                        key={entry.periodLabel}
                        fill={
                          entry.isBenchmark
                            ? "#6366f1"
                            : ragColor(entry.submittedPercent, isSel, entry.challengeMet)
                        }
                        stroke={entry.challengeMet ? "#b45309" : undefined}
                        strokeWidth={entry.challengeMet ? 2 : undefined}
                        className="cursor-pointer outline-none"
                      />
                    );
                  })}
                  <LabelList
                    dataKey="barTopLabel"
                    position="top"
                    offset={6}
                    fill="#0f172a"
                    fontSize={10}
                    fontWeight={600}
                  />
                  <LabelList dataKey="commentLabel" content={KpiCommentBubbleLabel} />
                </Bar>
                <Line
                  type="linear"
                  dataKey="target"
                  name="목표"
                  stroke={CHART_TARGET_LINE_STROKE}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  connectNulls
                  dot={{ r: 3, fill: CHART_TARGET_LINE_STROKE, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CHART_TARGET_LINE_STROKE }}
                >
                  {hasTargetNoteLabels ? (
                    <LabelList dataKey="targetNoteLabel" content={KpiTargetBubbleLabel} />
                  ) : null}
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 px-1 text-[11px] leading-snug text-slate-500">
              목표는 <span className="font-medium text-red-600">점선</span>, 실적은{" "}
              <span className="font-medium text-sky-700">막대</span>로 표시됩니다.{" "}
              <span className="font-medium text-indigo-600">B/M 막대</span>는 1월 왼쪽에 표시됩니다. 실적 막대는 승인 반영값 기준입니다.{" "}
              도전 목표를 달성한 월은 <span className="font-medium text-amber-600">금색 막대</span>로 강조됩니다.{" "}
              {chartVerticalAxisHint(effectiveIndicatorType, {
                normalLinkedToTarget: normalLinkedToTargetChart,
              })}
              {!indicatorUsesComputedAchievement(effectiveIndicatorType) &&
              !normalLinkedToTargetChart ? (
                <>
                  {" "}
                  높을수록 좋은 % 그래프는 0~100% 기준으로, 낮을수록 좋은 목표 연동 그래프는 목표값이 중간 높이에 오도록 표시됩니다.
                </>
              ) : null}
            </p>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              월 선택
            </p>
            <div className="flex flex-wrap gap-2">
              {displayMonthList.map((mo) => {
                const on = mo === selectedMonth;
                return (
                  <button
                    key={mo}
                    type="button"
                    onClick={() => setSelectedMonth(mo)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "bg-sky-600 text-white shadow-md shadow-sky-300/40"
                        : "border border-sky-200 bg-white text-slate-700 hover:bg-sky-50"
                    }`}
                  >
                    {formatAxisLabel(mo)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-sky-100 bg-white p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              {formatAxisLabel(selectedMonth)} 상세
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              {indicatorUsesComputedAchievement(effectiveIndicatorType) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    {computedActualLabel(effectiveIndicatorType)}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {selectedChartDatum &&
                    selectedRow?.actual_value !== null &&
                    selectedRow?.actual_value !== undefined &&
                    Number.isFinite(Number(selectedChartDatum.actual))
                      ? chartValueLabel(
                          effectiveIndicatorType,
                          Number(selectedChartDatum.actual)
                        )
                      : "—"}
                  </p>
                </div>
              ) : null}
              {effectiveIndicatorType === "normal" &&
              selectedRow?.actual_value !== null &&
              selectedRow?.actual_value !== undefined ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    실적 지표값
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {chartValueLabel("normal", Number(selectedRow.actual_value))}
                  </p>
                </div>
              ) : null}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">계산 달성률</p>
                <p className="mt-0.5 text-base font-bold text-sky-800">
                  {selectedSubmittedPercent !== null
                    ? formatKoPercentMax2(selectedSubmittedPercent)
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">승인 상태</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  {performanceStatusLabelKo(selectedStatus)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">계산 기준</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  {aggregationTypeLabelKo(selectedAggregationType)}
                </p>
              </div>
            </div>

            {selectedRejectionReason?.trim() ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="font-semibold">반려 사유:</span> {selectedRejectionReason}
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">코멘트</p>
              <p className="mt-0.5 text-sm text-slate-800">
                {selectedDescription?.trim() ? selectedDescription : "등록된 코멘트가 없습니다."}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">보고서</p>
              {selectedEvidenceItems.length > 0 ? (
                <div className="mt-1 space-y-2">
                  {selectedEvidenceItems.map((item, idx) => (
                    <div
                      key={`${item.storedValue}-${idx}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <p className="max-w-full truncate text-sm text-slate-800">
                        {item.fileName}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleDownloadEvidence(item.storedValue)}
                        disabled={downloadingEvidence}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                      >
                        <Download className="h-4 w-4" />
                        파일 다운로드
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">보고서가 없습니다</p>
              )}
            </div>

            {mode === "viewer" &&
            (workflowPrimaryVisible || workflowFinalVisible) ? (
              <div className="mt-4 border-t border-sky-200/80 pt-4">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  승인 처리 (그룹장·팀장·관리자)
                </p>
                <div className="flex flex-wrap gap-2">
                  {workflowPrimaryVisible ? (
                    <button
                      type="button"
                      disabled={workflowMut.isPending}
                      onClick={() => void handleModalApprovePrimary()}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      1차 승인
                    </button>
                  ) : null}
                  {workflowFinalVisible ? (
                    <button
                      type="button"
                      disabled={workflowMut.isPending}
                      onClick={() => void handleModalApproveFinal()}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      최종 승인
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={workflowMut.isPending}
                    onClick={() => openRejectModal()}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    반려
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          </div>

        </div>

        {mode === "editor" && canEditPerformance ? (
          <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-sky-100 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sky-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-sky-600" />
                <h4 className="text-sm font-semibold text-slate-800">실적 등록</h4>
              </div>
              <button
                type="button"
                onClick={() => setMode("viewer")}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    월 선택
                  </label>
                  {canAddDelayMonth && nextDelayMonth ? (
                    <button
                      type="button"
                      onClick={() => void handleExtendDelayMonth()}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {formatAxisLabel(nextDelayMonth)} 지연 월 추가
                    </button>
                  ) : null}
                </div>
                <select
                  value={editorMonth}
                  onChange={(e) => setEditorMonth(Number(e.target.value) as MonthKey)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                >
                  {displayMonthList.map((mo) => {
                    const row = findRowByMonth(liveRows, mo);
                    const locked = monthLockedForEditor(
                      row?.approval_step,
                      isPrivilegedEditor
                    );
                    return (
                      <option
                        key={mo}
                        value={mo}
                        disabled={locked}
                      >
                        {formatAxisLabel(mo)}
                        {locked ? " (승인대기/완료·잠금)" : ""}
                      </option>
                    );
                  })}
                </select>
                {editorMonthLocked ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    승인 대기 중이거나 승인 완료된 월은 그룹장·팀장·관리자만 수정할 수 있습니다.
                  </p>
                ) : null}
                {canAddDelayMonth ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    일정 지연 시 권한자가 다음 월을 한 달씩 추가할 수 있습니다.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  계산 기준
                </label>
                <select
                  value={editorAggregationType}
                  onChange={(e) =>
                    setEditorAggregationType(e.target.value as KpiAggregationType)
                  }
                  disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                >
                  <option value="monthly">당월 단독</option>
                  <option value="cumulative">누적 계산</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  기본값은 KPI 항목의 계산 기준입니다. 누적 계산은 이전 월 실적값을 더해 이번 월 달성률을 계산합니다.
                </p>
              </div>

              {!isComputedItem && !normalMetricEntryActive ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    달성률 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={editorRate}
                    onChange={(e) => setEditorRate(e.target.value)}
                    disabled={
                      !activeSet.has(editorMonth) || editorMonthLocked
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder="0–100"
                  />
                </div>
              ) : null}

              {!isComputedItem && normalMetricEntryActive ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    실적 지표값 (목표와 동일 단위)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editorRate}
                    onChange={(e) => setEditorRate(e.target.value)}
                    disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder={
                      item.targetDirection === "down"
                        ? "예: 불량율 등 (낮을수록 좋음 지표값)"
                        : "예: 달성 지표값 (높을수록 좋음)"
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {aggregationTypeLabelKo(editorAggregationType)} 기준 목표 지표:{" "}
                    {normalMonthlyTargetEditor !== null && normalMonthlyTargetEditor >= 0
                      ? chartValueLabel("normal", normalMonthlyTargetEditor)
                      : "—"}
                    . 계산 달성률:{" "}
                    {computedEditorPreviewPercent !== null
                      ? formatKoPercentMax2(computedEditorPreviewPercent)
                      : "지표값 입력 시 표시 (목표 대비 비율, 상한 100%)"}
                  </p>
                </div>
              ) : null}

              {isComputedItem ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {computedActualLabel(effectiveIndicatorType)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editorActualPpm}
                    onChange={(e) => setEditorActualPpm(e.target.value)}
                    disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder={
                      effectiveIndicatorType === "quantity"
                        ? "k(천) 단위 숫자"
                        : effectiveIndicatorType === "time"
                          ? "시간(h) 단위 숫자"
                          : effectiveIndicatorType === "uph"
                            ? "UPH 숫자"
                        : effectiveIndicatorType === "money"
                          ? "억 단위 숫자"
                          : "0 이상"
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {computedKindSummaryKo(effectiveIndicatorType)}는 아래 원값으로부터 달성률을 자동 계산합니다.{" "}
                    {aggregationTypeLabelKo(editorAggregationType)} 기준 {computedTargetLabel(effectiveIndicatorType)}:{" "}
                    {computedMonthlyTargetEditor !== null && computedMonthlyTargetEditor >= 0
                      ? chartValueLabel(effectiveIndicatorType, computedMonthlyTargetEditor)
                      : "미설정"}
                    . 계산 달성률:{" "}
                    {computedEditorPreviewPercent !== null
                      ? formatKoPercentMax2(computedEditorPreviewPercent)
                      : `${computedActualLabel(effectiveIndicatorType)} 입력 시 표시 (${computedFormulaHint(effectiveIndicatorType)})`}
                  </p>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  세부내용 / 코멘트
                </label>
                <textarea
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="해당 실적에 대한 세부내용을 입력해 주세요."
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  이 내용은 기존 코멘트 영역에 표시됩니다.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  그래프 말풍선
                </label>
                <input
                  type="text"
                  value={editorBubbleNote}
                  onChange={(e) => setEditorBubbleNote(e.target.value)}
                  disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                  maxLength={40}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="예: 고객 요청 지연"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  입력 시 해당 월 막대 위에 짧은 말풍선으로 표시됩니다.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  이 월 전용 보고서 파일{" "}
                  {isAdmin ? (
                    <span className="text-slate-500">(관리자: 선택)</span>
                  ) : (
                    <span className="text-red-600">(필수)</span>
                  )}
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-slate-700 hover:bg-sky-50">
                  <Upload className="h-4 w-4 text-sky-600" />
                  <span>
                    {editorFiles.length > 0
                      ? `${editorFiles.length}개 파일 선택됨`
                      : "파일 선택(여러 개 가능, 파일당 최대50MB)"}
                  </span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                    onChange={(e) => {
                      setEditorFiles(Array.from(e.target.files ?? []));
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {editorFiles.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {editorFiles.map((file, idx) => (
                      <li key={`${file.name}-${file.lastModified}-${idx}`} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-1 text-[11px] text-slate-500">
                  {isAdmin
                    ? "관리자 계정은 증빙 없이 저장할 수 있습니다. 파일을 선택하면 해당 월 증빙으로 저장됩니다."
                    : "최초 등록 시 파일 첨부가 필요합니다. 이미 첨부된 증빙이 있는 월은 달성률·코멘트만 바꿀 수 있으며, 파일을 다시 선택하면 선택한 파일 목록으로 교체됩니다."}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-sky-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setMode("viewer")}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleSaveMonth()}
                disabled={
                  saveMutation.isPending ||
                  uploading ||
                  !activeSet.has(editorMonth) ||
                  editorMonthLocked ||
                  !editorHasEvidenceForSave ||
                  (isComputedItem &&
                    parseNonNegativeDecimal(editorActualPpm) === null) ||
                  (normalMetricEntryActive &&
                    parseNonNegativeDecimal(editorRate) === null) ||
                  (!isComputedItem &&
                    !normalMetricEntryActive &&
                    !editorRate.trim())
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {normalizeRole(profileRole) === "team_leader" ||
                normalizeRole(profileRole) === "group_team_leader"
                  ? "저장 (즉시 승인 적용)"
                  : normalizeRole(profileRole) === "group_leader"
                    ? "저장 (최종 승인 대기로 제출)"
                    : "저장 (1차 승인 대기로 제출)"}
              </button>
              {canFinalComplete && !item.isFinalCompleted ? (
                <button
                  type="button"
                  onClick={() => void handleSaveMonth({ finalizeAfterSave: true })}
                  disabled={
                    saveMutation.isPending ||
                    uploading ||
                    !activeSet.has(editorMonth) ||
                    editorMonthLocked ||
                    !editorHasEvidenceForSave ||
                    (isComputedItem &&
                      parseNonNegativeDecimal(editorActualPpm) === null) ||
                    (normalMetricEntryActive &&
                      parseNonNegativeDecimal(editorRate) === null) ||
                    (!isComputedItem &&
                      !normalMetricEntryActive &&
                      !editorRate.trim())
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saveMutation.isPending || uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  저장 후 최종 완료
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {rejectModalOpen ? (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setRejectModalOpen(false);
                setRejectReasonDraft("");
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-modal-title"
              className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 id="reject-modal-title" className="text-base font-semibold text-slate-900">
                반려 사유
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                반려 후 실적은 draft로 되돌아가며, 사유는 작성자 화면에 표시됩니다.
              </p>
              <textarea
                value={rejectReasonDraft}
                onChange={(e) => setRejectReasonDraft(e.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 caret-slate-800 placeholder:text-slate-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                placeholder="반려 사유를 입력해 주세요."
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectModalOpen(false);
                    setRejectReasonDraft("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={workflowMut.isPending}
                  onClick={() => void submitRejectFromModal()}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  반려 처리
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
