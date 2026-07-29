"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, CircleHelp, Download, Loader2, Upload, X } from "lucide-react";
import {
  PERF_LEGACY_PENDING,
  PERF_STATUS_APPROVED,
  PERF_STATUS_DRAFT,
  PERF_STATUS_PENDING_FINAL,
  PERF_STATUS_PENDING_PRIMARY,
  isWriterPerformanceLockedByStep,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  getKpiTargetsHasPerformanceMonthlyColumn,
  computedAchievementPercent,
  qualitativeAchievementPercent,
  indicatorUsesComputedAchievement,
  buildFollowingCumulativeRateUpdates,
  buildPerformanceUiAchievementContext,
  computeEditorPreviewAchievementPercent,
  computeKpiPeriodOverallAchievementPercent,
  computeMonthPerformanceSlice,
  cumulativeTargetThroughMonth,
  findLatestPriorRowWithSubmittedValue,
  isChartVisiblePerformanceStep,
  performanceMonthlyCellsFromRows,
  resolveMonthlyChartTargetLine,
  resolveMonthlyTargetForMonth,
  resolvePerformanceAggregationType,
  actualForAchievementInPeriod,
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
  isMoneyIndicatorType,
  moneyIndicatorKindLabel,
  moneyIndicatorUnitSuffix,
  resolveNormalMonthlyTargetMetric,
  type NormalMonthlyTargetContext,
  type KpiHoldDropStatus,
  isKpiHoldDropActive,
  type ApprovalLineStep,
} from "@/src/lib/kpi-queries";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";
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
import { ApprovalLineSelectModal } from "./approval-line-modal";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  canGroupLeaderApprove,
  canTeamLeaderFinalApprove,
  isAdminRole,
  normalizeRole,
} from "@/src/lib/rbac";
import { AppToast, type ToastState } from "@/src/components/ui/toast";
import {
  useDeleteDraftMonthlyPerformanceMutation,
  useKpiPerformances,
  useUpsertMonthPerformance,
  useWithdrawPendingPerformanceMutation,
  useWorkflowReviewMutation,
} from "@/src/hooks/useKpiQueries";

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
  holdDropStatus?: KpiHoldDropStatus | null;
  holdDropReason?: string | null;
  evaluationType: KpiEvaluationType | null;
  unit: string | null;
  qualitativeCalcType: KpiQualitativeCalcType | null;
  aggregationType: KpiAggregationType | null;
  targetFillPolicy: KpiTargetFillPolicy | null;
  achievementCap: KpiAchievementCap;
  needsStructureReview?: boolean;
  linkedSecondary?: KpiModalItem | null;
  /** 부서 목록「전체」뷰와 동일 — 평가 구간 전체 기준 대표 달성률 */
  averageAchievement: number | null;
};

function KpiSummaryMetricGrid({
  item,
  effectiveIndicatorType,
  displayedFinalTargetValue,
  tone = "primary",
  kioskMode = false,
}: {
  item: KpiModalItem;
  effectiveIndicatorType: KpiIndicatorType;
  displayedFinalTargetValue: number | null;
  tone?: "primary" | "secondary";
  kioskMode?: boolean;
}) {
  const cellClassName =
    tone === "secondary"
      ? kioskMode
        ? "min-h-[3.5rem] min-w-0 rounded-lg bg-orange-100 px-6 py-3.5"
        : "min-w-0 rounded-lg bg-orange-100 px-2.5 py-2"
      : kioskMode
        ? "min-h-[3.5rem] min-w-0 rounded-lg bg-sky-100 px-6 py-3.5"
        : "min-w-0 rounded-lg bg-sky-100 px-2.5 py-2";
  const labelClassName = kioskMode
    ? "shrink-0 text-left text-[15px] font-semibold text-slate-500"
    : "truncate text-[10px] font-semibold text-slate-500";
  const valueClassName = kioskMode
    ? "min-w-0 shrink truncate whitespace-nowrap text-right text-[18px] font-semibold text-slate-800"
    : "mt-0.5 truncate whitespace-nowrap text-[13px] font-semibold text-slate-800";
  const cellLayoutClassName = kioskMode
    ? "flex min-w-0 flex-[1_1_0] basis-0 items-center justify-between gap-2"
    : "";
  const gridClassName = kioskMode
    ? "flex flex-nowrap items-stretch gap-4"
    : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";
  const metrics = [
    {
      label: "평가 유형",
      value: item.evaluationType === "qualitative" ? "정성 평가" : "정량 평가",
    },
    {
      label: "B/M",
      value: item.bm ? benchmarkLabel(effectiveIndicatorType, item.bm) : "—",
    },
    {
      label: "평가 기간",
      value: periodRangeLabel(item.periodStartMonth, item.periodEndMonth),
    },
    {
      label: "최종 목표값",
      value:
        displayedFinalTargetValue !== null &&
        displayedFinalTargetValue !== undefined
          ? chartValueLabel(effectiveIndicatorType, displayedFinalTargetValue)
          : "—",
    },
    {
      label: "가중치",
      value: item.weight || "—",
    },
    {
      label: "담당자",
      value: item.owner || "—",
    },
  ] as const;
  return (
    <div className={gridClassName}>
      {metrics.map(({ label, value }) => (
        <div key={label} className={`${cellClassName} ${cellLayoutClassName}`}>
          <p className={labelClassName}>{label}</p>
          <p className={valueClassName}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function KpiSummaryCard({
  title,
  item,
  effectiveIndicatorType,
  displayedFinalTargetValue,
  tone = "primary",
  kioskMode = false,
  showKioskRowTitle = false,
}: {
  title: string;
  item: KpiModalItem;
  effectiveIndicatorType: KpiIndicatorType;
  displayedFinalTargetValue: number | null;
  tone?: "primary" | "secondary";
  kioskMode?: boolean;
  showKioskRowTitle?: boolean;
}) {
  const cardClassName = kioskMode
    ? ""
    : tone === "secondary"
      ? "rounded-xl border border-orange-200 bg-white p-4"
      : "rounded-xl border border-sky-200 bg-white p-4";
  const titleClassName = kioskMode
    ? tone === "secondary"
      ? "mb-1.5 truncate text-base font-semibold text-orange-700"
      : "mb-1.5 truncate text-base font-semibold text-sky-700"
    : tone === "secondary"
      ? "mb-2 truncate text-xs font-semibold text-orange-700"
      : "mb-2 truncate text-xs font-semibold text-sky-700";
  const showTitle = !kioskMode || showKioskRowTitle;
  return (
    <section className={cardClassName}>
      {showTitle ? <p className={titleClassName}>{title}</p> : null}
      <KpiSummaryMetricGrid
        item={item}
        effectiveIndicatorType={effectiveIndicatorType}
        displayedFinalTargetValue={displayedFinalTargetValue}
        tone={tone}
        kioskMode={kioskMode}
      />
    </section>
  );
}

function kpiSummaryCardTitle(goalLabel: string, item: KpiModalItem): string {
  const detail = item.detailActivity.trim();
  return detail ? `${goalLabel} : ${detail}` : goalLabel;
}

/** 디스플레이 — 월별 상세 카드와 푸터 사이 고정 여백(px) */
const KIOSK_FOOTER_GAP_PX = 24;
const KIOSK_CHART_MIN_HEIGHT_PX = 80;
const KIOSK_METRICS_GAP_PX = 12;
const KIOSK_CHART_GAP_PX = 16;

/** 디스플레이 전용 — 대분류·소분류·세부사항 계층 블록 */
function KpiKioskTitleBlock({
  mainTopic,
  subTopic,
  detailActivity,
  goalLabel,
  tone = "primary",
}: {
  mainTopic: string;
  subTopic: string;
  detailActivity: string | null | undefined;
  goalLabel?: string;
  tone?: "primary" | "secondary";
}) {
  const goalAccentClass =
    tone === "secondary" ? "text-orange-700" : "text-sky-700";
  const mainTopicText = mainTopic?.trim() || "—";
  const subTopicText = subTopic?.trim() || "—";
  const detailText = detailActivity?.trim() || "—";

  return (
    <div className="min-w-0">
      {goalLabel ? (
        <p
          className={`mb-2.5 text-sm font-bold uppercase tracking-[0.14em] ${goalAccentClass}`}
        >
          {goalLabel}
        </p>
      ) : null}
      <p className="text-[1.05rem] font-medium leading-snug text-slate-500 sm:text-[1.15rem]">
        <span className="font-semibold text-sky-700">{mainTopicText}</span>
        <span className="mx-2 font-normal text-slate-300" aria-hidden>
          ›
        </span>
        <span className="text-slate-600">{subTopicText}</span>
      </p>
      <h3 className="mt-3.5 text-[1.575rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-[1.75rem] lg:text-[2rem]">
        {detailText}
      </h3>
    </div>
  );
}

function computedActualLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "실적 PPM";
  if (t === "quantity") return "실적 수량(k)";
  if (t === "count") return "실적 건수";
  if (t === "headcount") return "실적 인원(명)";
  if (isMoneyIndicatorType(t)) return `실적(${moneyIndicatorUnitSuffix(t)})`;
  if (t === "time") return "실적 시간(h)";
  if (t === "minutes") return "실적 시간(분)";
  if (t === "uph") return "실적 UPH";
  if (t === "cpk") return "실적 Cpk";
  return "실적";
}

function computedTargetLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "목표 PPM";
  if (t === "quantity") return "목표 수량(k)";
  if (t === "count") return "목표 건수";
  if (t === "headcount") return "목표 인원(명)";
  if (isMoneyIndicatorType(t)) return `목표(${moneyIndicatorUnitSuffix(t)})`;
  if (t === "time") return "목표 시간(h)";
  if (t === "minutes") return "목표 시간(분)";
  if (t === "uph") return "목표 UPH";
  if (t === "cpk") return "목표 Cpk";
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
  if (isMoneyIndicatorType(t)) {
    const unit = moneyIndicatorUnitSuffix(t);
    return `금액(${unit}): 높을수록 좋음·낮을수록 좋음은 수량(k)과 동일 공식, 숫자는 ${unit} 단위.`;
  }
  if (t === "time") {
    return "시간(h): 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  if (t === "minutes") {
    return "분(min): 시간(h)과 동일. 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  if (t === "uph") {
    return "UPH: 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  if (t === "cpk") {
    return "Cpk: 높을수록 좋음이면 실적÷목표×100, 낮을수록 좋음이면 목표÷실적×100 (상한 100%).";
  }
  return "";
}

function computedKindSummaryKo(t: KpiIndicatorType): string {
  if (t === "ppm") return "역지표(PPM)";
  if (t === "quantity") return "수량(k)";
  if (t === "count") return "건수";
  if (t === "headcount") return "인원(명)";
  if (isMoneyIndicatorType(t)) return moneyIndicatorKindLabel(t);
  if (t === "time") return "시간(h)";
  if (t === "minutes") return "분(min)";
  if (t === "uph") return "생산성(UPH)";
  if (t === "cpk") return "공정능력(Cpk)";
  return "";
}

function chartAxisTitle(indicatorType: KpiIndicatorType): string {
  return indicatorType === "normal" ? "%" : computedKindSummaryKo(indicatorType);
}

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
  commentLabelSecondary?: string;
  targetNoteLabel?: string;
  /** 이중 목표: 보조 막대·목표선 */
  targetSecondary?: number | null;
  /** 종합 뷰: 목표2 월별 목표 메모(말풍선) */
  targetNoteSecondaryLabel?: string;
  barPrimary?: number;
  barSecondary?: number;
  submittedPercentSecondary?: number | null;
  bmPrimaryText?: string;
  bmSecondaryText?: string;
  /** 종합 뷰: 목표1 해당 월 계산 달성률(평균 외 개별 표시용) */
  compositeAchievementGoal1Percent?: number | null;
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

/** 막대 위 표기 — 차트 `actual`(막대 높이)와 동일한 값 사용 (누적 계산 시 YTD 합) */
function chartBarTopLabel(
  indicatorType: KpiIndicatorType,
  showBarTopLabel: boolean,
  displayActual: number | null,
  rawSubmittedPercent: number | null
): string {
  if (!showBarTopLabel) return "";
  if (
    displayActual !== null &&
    displayActual !== undefined &&
    Number.isFinite(displayActual)
  ) {
    const n = displayActual;
    if (indicatorUsesComputedAchievement(indicatorType)) {
      if (indicatorType === "ppm") return `${formatKoMax2Decimals(n)}ppm`;
      if (indicatorType === "quantity") return `${formatKoMax2Decimals(n)}k`;
      if (indicatorType === "count") return `${formatKoMax2Decimals(n)}건`;
      if (indicatorType === "headcount") return `${formatKoMax2Decimals(n)}명`;
      if (isMoneyIndicatorType(indicatorType)) {
        return `${formatKoMax2Decimals(n)}${moneyIndicatorUnitSuffix(indicatorType)}`;
      }
      if (indicatorType === "time") return `${formatKoMax2Decimals(n)}h`;
      if (indicatorType === "minutes") return `${formatKoMax2Decimals(n)} min`;
      if (indicatorType === "uph") return `${formatKoMax2Decimals(n)} UPH`;
      if (indicatorType === "cpk") return `${formatKoMax2Decimals(n)} Cpk`;
    }
    if (indicatorType === "normal") {
      return `${formatKoMax2Decimals(n)}%`;
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
  /** 선임/프로·권한 없음 등: 뷰어만 */
  canEditPerformance?: boolean;
  /** 로그인 사용자 `profiles.role` (한글·영문) — 승인 버튼 노출용 */
  profileRole?: string | null;
  /** 로그인 사용자 `profiles.id` — 제출 회수(submitted_by 검증) */
  profileUserId?: string | null;
  canFinalizeKpiItem?: boolean;
  onFinalizeKpiItem?: (
    kpiId: string,
    completed?: boolean
  ) => Promise<boolean> | boolean;
  canHoldDropKpiItem?: boolean;
  onHoldDropKpiItem?: (
    kpiId: string,
    status: KpiHoldDropStatus | null,
    reason?: string | null
  ) => Promise<boolean> | boolean;
  onExtendPeriodEndMonth?: (kpiId: string) => Promise<boolean> | boolean;
  /** 부서 상세 딥링크 등에서 모달 열 때 선택할 월 */
  initialEditorMonth?: MonthKey | null;
  /** TV 전시(/display): 닫기·우측 입력·승인 UI 숨김, 전체화면 레이아웃 */
  kioskMode?: boolean;
  /** TV 전시 시 헤더 상단 중앙에 표시할 부서명 */
  kioskDeptName?: string;
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

/** 월 목표 연동 normal: 정성은 화면에서 editorActualPpm만 쓰고, 정량은 editorRate를 씀 */
function normalMonthlyActualInputForSave(
  isComputedItem: boolean,
  editorRate: string,
  editorActualPpm: string
): string {
  return isComputedItem ? editorActualPpm : editorRate;
}

function parseBenchmarkValue(raw: string | null | undefined): number | null {
  const match = String(raw ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function isChartVisibleStep(step: string | null | undefined): boolean {
  return isChartVisiblePerformanceStep(step);
}

function findRowByMonth(
  rows: ItemPerformanceRow[],
  m: MonthKey
): ItemPerformanceRow | null {
  return rows.find((r) => halfTypeLabelToMonth(r.half_type) === m) ?? null;
}

/** 저장 확인·Primary 버튼 라벨 — 해당 월에 이미 저장된 실적 입력이 있는지 */
function rowHasSavedPerformanceInput(
  rows: ItemPerformanceRow[],
  month: MonthKey,
  indicatorType: KpiIndicatorType
): boolean {
  const row = findRowByMonth(rows, month);
  if (!row) return false;
  const rawSubmitted =
    row.achievement_rate !== null &&
    row.achievement_rate !== undefined &&
    !Number.isNaN(Number(row.achievement_rate))
      ? Number(row.achievement_rate)
      : null;
  return monthHasSubmittedPerformanceInput(indicatorType, row, rawSubmitted);
}

/** 반려·회수 후 draft로 돌아온 월 — 저장 확인·버튼에 '재등록' 문구 사용 */
function isDraftRowReregisterContext(
  er: ItemPerformanceRow | null | undefined,
  uid: string | null | undefined
): boolean {
  if (!uid?.trim() || !er?.id) return false;
  const st = (er.approval_step ?? "").trim().toLowerCase();
  const isDraft = !st || st === PERF_STATUS_DRAFT;
  if (!isDraft) return false;
  const u = uid.trim();
  const rr = er.rejection_reason?.trim() ?? "";
  const sub = er.submitted_by?.trim() ?? "";
  const wby = er.withdrawn_by?.trim() ?? "";
  const rejectedMine = rr.length > 0 && sub === u;
  const withdrawnMine = wby === u;
  return rejectedMine || withdrawnMine;
}

function buildRowByMonthMap(rows: ItemPerformanceRow[]): Map<MonthKey, ItemPerformanceRow> {
  const map = new Map<MonthKey, ItemPerformanceRow>();
  for (const r of rows) {
    const mk = halfTypeLabelToMonth(r.half_type);
    if (mk !== null && !map.has(mk)) map.set(mk, r);
  }
  return map;
}

function chartDatumFromClickData(data: unknown): ChartDatum | null {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const payload = rec?.payload;
  const candidate =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : rec;
  if (!candidate) return null;
  const month = candidate.month;
  if (typeof month !== "number" || month === 0) return null;
  return candidate as unknown as ChartDatum;
}

function aggregationTypeLabelKo(value: KpiAggregationType): string {
  return value === "cumulative" ? "누적 계산" : "당월 단독";
}

function performanceStatusLabelKo(status: string | null | undefined): string {
  const s = status?.trim().toLowerCase() ?? "";
  if (s === "draft") return "제출 전";
  if (s === "pending_primary" || s === "pending") return "1차 승인 대기";
  if (s === PERF_STATUS_PENDING_FINAL) return "최종 승인 대기";
  if (s === PERF_STATUS_APPROVED) return "승인 완료";
  return status?.trim() ? status.trim() : "—";
}

function performanceAchievementBarColor(rate: number | null, selected: boolean): string {
  if (rate === null || !Number.isFinite(rate)) {
    return selected ? "#b91c1c" : "#ef4444";
  }
  if (rate >= 100) {
    return selected ? "#047857" : "#10b981";
  }
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

function bubbleFullText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  return text.trim();
}

const CHART_BUBBLE_MAX_WIDTH_PX = 240;
const CHART_BUBBLE_FONT_SIZE_PX = 10;
const CHART_BUBBLE_LINE_HEIGHT_PX = 14;
const CHART_BUBBLE_PAD_X_PX = 10;
const CHART_BUBBLE_PAD_Y_PX = 8;
const CHART_BUBBLE_GAP_PX = 10;

type ChartBubbleTheme = "target" | "performance" | "goal1" | "goal2";
type ChartBubblePlacement = "top-left" | "bottom-right";

const CHART_BUBBLE_THEME: Record<
  ChartBubbleTheme,
  { bg: string; border: string; text: string; anchor: string }
> = {
  target: { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", anchor: "#dc2626" },
  performance: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e", anchor: "#f59e0b" },
  goal1: { bg: "#e0f2fe", border: "#0284c7", text: "#075985", anchor: "#0284c7" },
  goal2: { bg: "#ffedd5", border: "#ea580c", text: "#9a3412", anchor: "#ea580c" },
};

function estimateBubbleBoxHeight(text: string, boxWidth: number): number {
  const charWidth = CHART_BUBBLE_FONT_SIZE_PX * 0.92;
  const charsPerLine = Math.max(
    4,
    Math.floor((boxWidth - CHART_BUBBLE_PAD_X_PX * 2) / charWidth)
  );
  const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
  return (
    lineCount * CHART_BUBBLE_LINE_HEIGHT_PX + CHART_BUBBLE_PAD_Y_PX * 2
  );
}

function estimateBubbleBoxWidth(text: string): number {
  const charWidth = CHART_BUBBLE_FONT_SIZE_PX * 0.92;
  const raw = text.length * charWidth + CHART_BUBBLE_PAD_X_PX * 2;
  return Math.max(52, Math.min(CHART_BUBBLE_MAX_WIDTH_PX, Math.ceil(raw)));
}

function KpiChartSpeechBubble({
  anchorX,
  anchorY,
  text,
  placement,
  theme,
}: {
  anchorX: number;
  anchorY: number;
  text: string;
  placement: ChartBubblePlacement;
  theme: ChartBubbleTheme;
}) {
  const label = bubbleFullText(text);
  if (!label) return null;
  const palette = CHART_BUBBLE_THEME[theme];
  const boxWidth = estimateBubbleBoxWidth(label);
  const boxHeight = estimateBubbleBoxHeight(label, boxWidth);
  const boxX =
    placement === "top-left"
      ? anchorX - boxWidth - CHART_BUBBLE_GAP_PX
      : anchorX + CHART_BUBBLE_GAP_PX;
  const boxY =
    placement === "top-left"
      ? anchorY - boxHeight - CHART_BUBBLE_GAP_PX
      : anchorY + CHART_BUBBLE_GAP_PX;
  const pointerX =
    placement === "top-left" ? boxX + boxWidth : boxX;
  const pointerY =
    placement === "top-left" ? boxY + boxHeight : boxY;

  return (
    <g pointerEvents="none">
      <line
        x1={anchorX}
        y1={anchorY}
        x2={pointerX}
        y2={pointerY}
        stroke={palette.anchor}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <circle cx={anchorX} cy={anchorY} r={2.5} fill={palette.anchor} />
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        rx={8}
        fill={palette.bg}
        stroke={palette.border}
        strokeWidth={1}
      />
      <foreignObject x={boxX} y={boxY} width={boxWidth} height={boxHeight}>
        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            height: "100%",
            padding: `${CHART_BUBBLE_PAD_Y_PX}px ${CHART_BUBBLE_PAD_X_PX}px`,
            fontSize: `${CHART_BUBBLE_FONT_SIZE_PX}px`,
            fontWeight: 700,
            lineHeight: `${CHART_BUBBLE_LINE_HEIGHT_PX}px`,
            color: palette.text,
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          {label}
        </div>
      </foreignObject>
    </g>
  );
}

function createTargetLineDotRenderer(options: {
  onTargetClick: (month: MonthKey, goalKind: "primary" | "secondary") => void;
  goalKind: "primary" | "secondary";
  stroke: string;
  shiftX?: number;
}) {
  const { onTargetClick, goalKind, stroke, shiftX = 0 } = options;
  return function TargetLineDot(props: {
    cx?: number;
    cy?: number;
    payload?: ChartDatum;
  }) {
    const month = props.payload?.month;
    if (
      !Number.isFinite(props.cx) ||
      !Number.isFinite(props.cy) ||
      typeof month !== "number" ||
      month === 0
    ) {
      return null;
    }
    const cx = (props.cx as number) + shiftX;
    const cy = props.cy as number;
    return (
      <g className="cursor-pointer">
        <circle
          cx={cx}
          cy={cy}
          r={10}
          fill="transparent"
          stroke="transparent"
          onClick={(event) => {
            event.stopPropagation();
            onTargetClick(month as MonthKey, goalKind);
          }}
        />
        <circle cx={cx} cy={cy} r={3} fill={stroke} strokeWidth={0} pointerEvents="none" />
      </g>
    );
  };
}

/** 비관리자: draft(또는 비어 있음)만 편집 가능. 관리자는 항상 편집 가능. */
function monthLockedForEditor(
  step: string | null | undefined,
  canOverrideLock: boolean
): boolean {
  if (canOverrideLock) return false;
  return isWriterPerformanceLockedByStep(step);
}

type HoveredCompositeSeries = "primary" | "secondary" | null;
type ChartViewMode = "primary" | "secondary" | "composite";

type FocusedBubbleMonth = MonthKey | null;
type FocusedBubbleKind = "primary" | "secondary" | null;
type BubbleDisplayMode = "none" | "target" | "comment" | "bar";

function KpiChartTooltip({
  active,
  payload,
  indicatorType,
  hoveredCompositeSeries,
  disabled,
}: {
  active?: boolean;
  payload?: { payload?: ChartDatum }[];
  indicatorType: KpiIndicatorType;
  hoveredCompositeSeries?: HoveredCompositeSeries;
  disabled?: boolean;
}) {
  if (disabled) return null;
  if (!active || !payload?.length) return null;
  const d =
    payload.find((p) => p.payload)?.payload ?? (payload[0]!.payload as ChartDatum | undefined);
  if (!d) return null;
  const dualCompositePoint =
    !d.isBenchmark &&
    (d.barPrimary !== undefined || d.barSecondary !== undefined);
  return (
    <div className="rounded-xl border border-sky-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-semibold text-slate-800">{d.periodLabel}</p>
      {d.isBenchmark &&
      d.barPrimary !== undefined &&
      d.barSecondary !== undefined ? (
        hoveredCompositeSeries === "primary" ? (
          <p className="text-slate-600">목표 1 {d.bmPrimaryText?.trim() || "—"}</p>
        ) : hoveredCompositeSeries === "secondary" ? (
          <p className="text-slate-600">목표 2 {d.bmSecondaryText?.trim() || "—"}</p>
        ) : (
          <>
            <p className="text-slate-600">목표 1 {d.bmPrimaryText?.trim() || "—"}</p>
            <p className="text-slate-600">목표 2 {d.bmSecondaryText?.trim() || "—"}</p>
          </>
        )
      ) : d.isBenchmark ? (
        <p className="text-slate-600">B/M {d.barTopLabel || chartValueLabel(indicatorType, d.actual)}</p>
      ) : dualCompositePoint ? (
        hoveredCompositeSeries === "primary" ? (
          <>
            <p className="text-slate-600">
              목표 1{" "}
              {d.target !== null && d.target !== undefined
                ? chartValueLabel(indicatorType, d.target)
                : "—"}
            </p>
            <p className="text-sky-700">
              실적 1{" "}
              {d.barPrimary !== undefined && Number.isFinite(d.barPrimary)
                ? chartValueLabel(indicatorType, d.barPrimary)
                : "—"}
            </p>
          </>
        ) : hoveredCompositeSeries === "secondary" ? (
          <>
            <p className="text-slate-600">
              목표 2{" "}
              {d.targetSecondary !== null && d.targetSecondary !== undefined
                ? chartValueLabel(indicatorType, d.targetSecondary)
                : "—"}
            </p>
            <p className="text-amber-900/90">
              실적 2{" "}
              {d.barSecondary !== undefined && Number.isFinite(d.barSecondary)
                ? chartValueLabel(indicatorType, d.barSecondary)
                : "—"}
            </p>
          </>
        ) : (
          <>
            <p className="text-slate-600">
              목표 1{" "}
              {d.target !== null && d.target !== undefined
                ? chartValueLabel(indicatorType, d.target)
                : "—"}
            </p>
            <p className="text-sky-700">
              실적 1{" "}
              {d.barPrimary !== undefined && Number.isFinite(d.barPrimary)
                ? chartValueLabel(indicatorType, d.barPrimary)
                : "—"}
            </p>
            <p className="text-slate-600">
              목표 2{" "}
              {d.targetSecondary !== null && d.targetSecondary !== undefined
                ? chartValueLabel(indicatorType, d.targetSecondary)
                : "—"}
            </p>
            <p className="text-amber-900/90">
              실적 2{" "}
              {d.barSecondary !== undefined && Number.isFinite(d.barSecondary)
                ? chartValueLabel(indicatorType, d.barSecondary)
                : "—"}
            </p>
          </>
        )
      ) : (
        <>
          <p className="text-slate-600">
            목표 {d.target !== null ? chartValueLabel(indicatorType, d.target) : "—"}
          </p>
          <p className="text-sky-700">실적 {chartValueLabel(indicatorType, d.actual)}</p>
        </>
      )}
      {!d.isBenchmark
        ? d.hasComment && d.description ? (
            <p className="mt-1 max-w-[220px] border-t border-sky-200 pt-1 text-[11px] leading-snug text-slate-500">
              {previewComment(d.description, 72)}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">진행 내용 없음</p>
          )
        : null}
    </div>
  );
}

/** 사이드바 스크롤 영역 밖에서도 잘리지 않도록 body에 고정 표시 */
function FieldInfoTip({
  children,
  ariaLabel = "필드 안내",
}: {
  children: ReactNode;
  ariaLabel?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0 });

  const sync = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left + r.width / 2 });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    sync();
    const handler = () => sync();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, sync]);

  return (
    <>
      <span className="inline-flex shrink-0 align-middle">
        <button
          ref={btnRef}
          type="button"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80"
          aria-label={ariaLabel}
          onMouseEnter={() => {
            sync();
            setOpen(true);
          }}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => {
            sync();
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] w-[min(17rem,calc(100vw-1.5rem))] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-slate-700 shadow-xl"
            style={{
              top: box.top,
              left: box.left,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

const CHART_BAR_LEGEND_FILL = "#10b981";
const CHART_TARGET_LINE_STROKE = "#dc2626";
/** 종합 뷰: 목표1·목표2 목표선(실적 막대 색과 통일) */
const CHART_COMPOSITE_GOAL1_TARGET_STROKE = "#0284c7";
const CHART_COMPOSITE_GOAL2_TARGET_STROKE = "#ea580c";
/** 벤치마크(B/M) 막대 — 연한 회색(가독성 유지) */
const CHART_BENCHMARK_BAR_FILL = "#8b93a0";

/**
 * 실적 막대 최소 높이(px). 표시 전용(픽셀)으로만 쓰이며 Y축 도메인·툴팁 값은 원 데이터 그대로.
 * 잡는 법: 라벨 폰트 크기(여기서는 10px) + 위아래 여백을 합친 뒤, 차트 높이(약 320~360px)에서
 * 막대가 과하게 두껍게 보이지 않는 범위로 조정. 일반적으로 20~28px.
 */
const CHART_BAR_MIN_PIXEL_HEIGHT = 24;
/**
 * 그려진 막대 높이가 이보다 작으면 실적 숫자를 막대 안이 아니라 위(바깥)에 둔다.
 * 보통 CHART_BAR_MIN_PIXEL_HEIGHT보다 1~4px 작게 두면 “안에 넣기 어려운” 경우만 바깥으로 보낸다.
 */
const CHART_BAR_LABEL_OUTSIDE_IF_BELOW_PX = 22;

function fillForInsideBarLabel(barFill: string): string {
  return barFill === CHART_BENCHMARK_BAR_FILL ? "#0f172a" : "#ffffff";
}

function ActualPerformanceBarShape(
  props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
    payload?: ChartDatum;
  },
  barLabelFontSize = 10
) {
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const width = props.width ?? 0;
  const height = props.height ?? 0;
  const fill = props.fill ?? CHART_BAR_LEGEND_FILL;
  const payload = props.payload;
  if (!payload || width <= 0) return null;

  const barTop = Math.min(y, y + height);
  const barBottom = Math.max(y, y + height);
  const rawH = barBottom - barTop;
  const labelText = payload.barTopLabel?.trim() ?? "";
  const hasLabel = Boolean(labelText);
  const numericActual = Number(payload.actual);
  const isZeroMetric =
    !payload.isBenchmark && Number.isFinite(numericActual) && numericActual === 0;

  let displayH = rawH;
  if (hasLabel && rawH > 0) {
    if (!isZeroMetric || payload.isBenchmark) {
      displayH = Math.max(rawH, CHART_BAR_MIN_PIXEL_HEIGHT);
    }
  }
  if (hasLabel && isZeroMetric) {
    displayH = Math.max(rawH, 6);
  }

  const displayY = barBottom - displayH;
  const rx = Math.min(6, Math.max(0, displayH / 2));
  const cx = x + width / 2;
  const labelInside =
    hasLabel && displayH >= CHART_BAR_LABEL_OUTSIDE_IF_BELOW_PX;
  const insideFill = fillForInsideBarLabel(fill);

  return (
    <g className="recharts-bar-rectangle" style={{ outline: "none" }}>
      {displayH > 0 ? (
        <rect
          x={x}
          y={displayY}
          width={width}
          height={displayH}
          rx={rx}
          ry={rx}
          fill={fill}
          className="cursor-pointer"
          style={{ outline: "none" }}
        />
      ) : null}
      {hasLabel ? (
        <text
          x={cx}
          y={
            labelInside
              ? displayY + displayH / 2
              : displayY - (displayH > 0 ? 6 : 2)
          }
          fill={labelInside ? insideFill : "#0f172a"}
          fontSize={barLabelFontSize}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline={labelInside ? "middle" : "auto"}
          pointerEvents="none"
          className="tabular-nums"
        >
          {labelText}
        </text>
      ) : null}
    </g>
  );
}

function legendMiniLine(stroke: string, dashed?: boolean) {
  return (
    <svg width={44} height={12} viewBox="0 0 44 12" className="overflow-visible">
      <line
        x1={10}
        y1={6}
        x2={14}
        y2={6}
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <circle cx={22} cy={6} r={2.75} fill={stroke} />
      <line
        x1={30}
        y1={6}
        x2={34}
        y2={6}
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

/** 차트 아래 범례 */
function KpiChartFullLegend({
  dualComposite,
  kioskMode = false,
}: {
  dualComposite?: boolean;
  kioskMode?: boolean;
}) {
  const legendTextClass = kioskMode
    ? "text-[13px] font-medium text-slate-800"
    : "text-[11px] font-medium text-slate-800";
  const swatchClass = kioskMode ? "h-4 w-4" : "h-3.5 w-3.5";
  if (dualComposite) {
    return (
      <ul
        className={`mt-1 flex list-none flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4 ${legendTextClass}`}
        aria-label="차트 범례"
      >
        <li className="flex items-center gap-1.5">
          <span
            className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
            style={{ backgroundColor: "#0284c7" }}
            aria-hidden
          />
          <span>B/M 1</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
            style={{ backgroundColor: "#ea580c" }}
            aria-hidden
          />
          <span>B/M 2</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center" aria-hidden>
            {legendMiniLine(CHART_COMPOSITE_GOAL1_TARGET_STROKE)}
          </span>
          <span>목표 1</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center" aria-hidden>
            {legendMiniLine(CHART_COMPOSITE_GOAL2_TARGET_STROKE)}
          </span>
          <span>목표 2</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
            style={{ backgroundColor: "#0284c7" }}
            aria-hidden
          />
          <span>실적 1</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
            style={{ backgroundColor: "#ea580c" }}
            aria-hidden
          />
          <span>실적 2</span>
        </li>
      </ul>
    );
  }
  return (
    <ul
      className={`mt-1 flex list-none flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-x-5 ${legendTextClass}`}
      aria-label="차트 범례"
    >
      <li className="flex items-center gap-1.5">
        <span
          className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
          style={{ backgroundColor: CHART_BENCHMARK_BAR_FILL }}
          aria-hidden
        />
        <span>B/M</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-flex shrink-0 items-center" aria-hidden>
          {legendMiniLine(CHART_TARGET_LINE_STROKE)}
        </span>
        <span>목표</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
          style={{ backgroundColor: "#ef4444" }}
          aria-hidden
        />
        <span>미달</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className={`inline-block shrink-0 rounded-[2px] ${swatchClass}`}
          style={{ backgroundColor: "#10b981" }}
          aria-hidden
        />
        <span>달성</span>
      </li>
    </ul>
  );
}

/** 실적 말풍선 — 막대 상단 기준 우측 하단 */
function KpiCommentBubbleLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}) {
  const { x, y, width, value } = props;
  if (typeof value !== "string" || !value.trim()) return null;
  const nx = Number(x);
  const ny = Number(y);
  const widthRaw = Number(width);
  const nw = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 26;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const anchorX = nx + nw / 2;
  const anchorY = ny;
  return (
    <KpiChartSpeechBubble
      anchorX={anchorX}
      anchorY={anchorY}
      text={value}
      placement="bottom-right"
      theme="performance"
    />
  );
}

/** 종합(이중 목표) 목표2 실적 말풍선 — 우측 하단 (약간 오프셋) */
function KpiCommentBubbleLabelSecondary(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}) {
  const { x, y, width, value } = props;
  if (typeof value !== "string" || !value.trim()) return null;
  const nx = Number(x);
  const ny = Number(y);
  const widthRaw = Number(width);
  const nw = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 26;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const anchorX = nx + nw / 2 + 8;
  const anchorY = ny + 4;
  return (
    <KpiChartSpeechBubble
      anchorX={anchorX}
      anchorY={anchorY}
      text={value}
      placement="bottom-right"
      theme="performance"
    />
  );
}

function resolveFocusedCommentBubbleValue(opts: {
  datum: ChartDatum | undefined;
  focusedMonth: FocusedBubbleMonth;
  focusedKind: FocusedBubbleKind;
  displayMode: BubbleDisplayMode;
  kind: "primary" | "secondary";
  draftValue?: string;
  commentsByMonth?: Map<MonthKey, ItemPerformanceRow>;
  monthList?: MonthKey[];
}): string | null {
  const {
    datum: d,
    focusedMonth,
    focusedKind,
    displayMode,
    kind,
    draftValue = "",
    commentsByMonth,
    monthList = [],
  } = opts;
  if (!d || typeof d.month !== "number" || d.month === 0) return null;
  if (displayMode !== "comment" && displayMode !== "bar") return null;
  if (displayMode === "bar" && focusedMonth === null) return null;
  if (focusedMonth !== null && focusedMonth !== d.month) return null;
  if (focusedKind !== null && focusedKind !== kind) return null;

  const fallbackValueFromDatum =
    kind === "secondary" ? d.commentLabelSecondary ?? "" : d.commentLabel ?? "";
  const fallbackFromRows =
    commentsByMonth
      ? commentsByMonth.get(d.month)?.bubble_note ??
        findLatestPriorRowWithSubmittedValue(commentsByMonth, d.month, monthList)?.row
          ?.bubble_note ??
        ""
      : "";
  const resolvedValue =
    fallbackValueFromDatum || fallbackFromRows || draftValue.trim();

  return resolvedValue.trim() ? resolvedValue.trim() : null;
}

function CompositeActualPerformanceBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ChartDatum;
  kind: "primary" | "secondary";
  focusedMonth: FocusedBubbleMonth;
  focusedKind: FocusedBubbleKind;
  displayMode: BubbleDisplayMode;
  draftValue?: string;
  commentsByMonth?: Map<MonthKey, ItemPerformanceRow>;
  monthList?: MonthKey[];
  showBubble?: boolean;
}) {
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const width = props.width ?? 0;
  const height = props.height ?? 0;
  const fill = props.fill ?? (props.kind === "secondary" ? "#ea580c" : "#0284c7");
  if (width <= 0) return null;

  const barTop = Math.min(y, y + height);
  const barBottom = Math.max(y, y + height);
  const displayH = barBottom - barTop;
  const rx = Math.min(4, Math.max(0, displayH / 2));
  const bubbleValue =
    props.showBubble === false
      ? null
      : resolveFocusedCommentBubbleValue({
          datum: props.payload,
          focusedMonth: props.focusedMonth,
          focusedKind: props.focusedKind,
          displayMode: props.displayMode,
          kind: props.kind,
          draftValue: props.draftValue,
          commentsByMonth: props.commentsByMonth,
          monthList: props.monthList,
        });

  return (
    <g className="recharts-bar-rectangle" style={{ outline: "none" }}>
      {displayH > 0 ? (
        <rect
          x={x}
          y={barTop}
          width={width}
          height={displayH}
          rx={rx}
          ry={rx}
          fill={fill}
          className="cursor-pointer"
          style={{ outline: "none" }}
        />
      ) : null}
      {bubbleValue ? (
        props.kind === "secondary" ? (
          <KpiCommentBubbleLabelSecondary
            x={x}
            y={barTop}
            width={width}
            value={bubbleValue}
          />
        ) : (
          <KpiCommentBubbleLabel
            x={x}
            y={barTop}
            width={width}
            value={bubbleValue}
          />
        )
      ) : null}
    </g>
  );
}

/** 목표 말풍선 — 목표선 점 기준 좌측 상단 */
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
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return (
    <KpiChartSpeechBubble
      anchorX={nx}
      anchorY={ny}
      text={value}
      placement="top-left"
      theme="target"
    />
  );
}

const COMPOSITE_BAR_SIZE_PX = 26;
const COMPOSITE_BAR_GAP_PX = 8;
const COMPOSITE_BAR_CENTER_SHIFT_PX =
  (COMPOSITE_BAR_SIZE_PX + COMPOSITE_BAR_GAP_PX) / 2;
const COMPOSITE_GOAL1_X_SHIFT = -COMPOSITE_BAR_CENTER_SHIFT_PX;
const COMPOSITE_GOAL2_X_SHIFT = COMPOSITE_BAR_CENTER_SHIFT_PX;

function KpiTargetBubbleLabelGoal1({
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
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return (
    <KpiChartSpeechBubble
      anchorX={nx}
      anchorY={ny}
      text={value}
      placement="top-left"
      theme="goal1"
    />
  );
}

function KpiTargetBubbleLabelGoal2({
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
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return (
    <KpiChartSpeechBubble
      anchorX={nx}
      anchorY={ny}
      text={value}
      placement="top-left"
      theme="goal2"
    />
  );
}

function chartValueLabel(indicatorType: KpiIndicatorType, value: number): string {
  if (indicatorType === "ppm") return `${formatKoMax2Decimals(value)} ppm`;
  if (indicatorType === "quantity") return `${formatKoMax2Decimals(value)} k`;
  if (indicatorType === "count") return `${formatKoMax2Decimals(value)} 건`;
  if (indicatorType === "headcount") return `${formatKoMax2Decimals(value)} 명`;
  if (isMoneyIndicatorType(indicatorType)) {
    return `${formatKoMax2Decimals(value)}${moneyIndicatorUnitSuffix(indicatorType)}`;
  }
  if (indicatorType === "time") return `${formatKoMax2Decimals(value)} h`;
  if (indicatorType === "minutes") return `${formatKoMax2Decimals(value)} min`;
  if (indicatorType === "uph") return `${formatKoMax2Decimals(value)} UPH`;
  if (indicatorType === "cpk") return `${formatKoMax2Decimals(value)} Cpk`;
  return formatKoPercentMax2(value);
}

function FocusedCommentBubbleLabelFactory(
  opts: {
    focusedMonth: FocusedBubbleMonth;
    focusedKind: FocusedBubbleKind;
    displayMode: BubbleDisplayMode;
    kind?: "primary" | "secondary";
    chartData: ChartDatum[];
    draftValue?: string;
    commentsByMonth?: Map<MonthKey, ItemPerformanceRow>;
    monthList?: MonthKey[];
    shiftX?: number;
  }
) {
  const {
    focusedMonth,
    focusedKind,
    displayMode,
    kind = "primary",
    chartData,
    draftValue = "",
    commentsByMonth,
    monthList = [],
    shiftX = 0,
  } =
    opts;
  return function FocusedCommentBubbleLabel(p: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    value?: unknown;
    payload?: ChartDatum;
    index?: number;
    viewBox?: unknown;
  }) {
    const byIndex =
      typeof p.index === "number" && p.index >= 0 ? chartData[p.index] : undefined;
    const d = p.payload ?? byIndex;
    if (!d || typeof d.month !== "number" || d.month === 0) return null;
    if (displayMode !== "comment" && displayMode !== "bar") return null;
    if (displayMode === "bar" && focusedMonth === null) return null;
    if (focusedMonth !== null && focusedMonth !== d.month) return null;
    if (focusedKind !== null && focusedKind !== kind) return null;
    const resolvedValue = resolveFocusedCommentBubbleValue({
      datum: d,
      focusedMonth,
      focusedKind,
      displayMode,
      kind,
      draftValue,
      commentsByMonth,
      monthList,
    });
    if (!resolvedValue) return null;
    const vb = (p.viewBox ?? {}) as {
      x?: number | string;
      y?: number | string;
      width?: number | string;
      height?: number | string;
    };
    const rawX = p.x ?? vb.x;
    const resolvedX =
      typeof rawX === "number"
        ? rawX + shiftX
        : Number.isFinite(Number(rawX))
          ? Number(rawX) + shiftX
          : rawX;
    const resolvedY = p.y ?? vb.y;
    const resolvedWidth = p.width ?? vb.width;
    return kind === "secondary" ? (
      <KpiCommentBubbleLabelSecondary
        x={resolvedX}
        y={resolvedY}
        width={resolvedWidth}
        value={resolvedValue}
      />
    ) : (
      <KpiCommentBubbleLabel
        x={resolvedX}
        y={resolvedY}
        width={resolvedWidth}
        value={resolvedValue}
      />
    );
  };
}

function FocusedTargetBubbleLabelFactory(
  renderer: (p: { x?: number | string; y?: number | string; value?: unknown }) => ReactElement | null,
  focusedMonth: FocusedBubbleMonth,
  focusedKind: FocusedBubbleKind,
  displayMode: BubbleDisplayMode,
  targetKind: "primary" | "secondary",
  valueKey: "targetNoteLabel" | "targetNoteSecondaryLabel",
  chartData: ChartDatum[],
  shiftX = 0
) {
  return function FocusedTargetBubbleLabel(p: {
    x?: number | string;
    y?: number | string;
    value?: unknown;
    payload?: ChartDatum;
    index?: number;
    viewBox?: unknown;
  }) {
    const byIndex =
      typeof p.index === "number" && p.index >= 0 ? chartData[p.index] : undefined;
    const d = p.payload ?? byIndex;
    if (!d || typeof d.month !== "number" || d.month === 0) return null;
    if (displayMode !== "target" && displayMode !== "bar") return null;
    if (displayMode === "bar" && focusedMonth === null) return null;
    if (focusedMonth !== null && focusedMonth !== d.month) return null;
    if (focusedMonth !== null && focusedKind !== null && focusedKind !== targetKind) {
      return null;
    }
    const fallbackValue = d[valueKey];
    const resolvedValue =
      typeof p.value === "string" && p.value.trim()
        ? p.value
        : typeof fallbackValue === "string"
          ? fallbackValue
          : "";
    if (!resolvedValue.trim()) return null;
    const vb = (p.viewBox ?? {}) as { x?: number | string; y?: number | string };
    const rawX = p.x ?? vb.x;
    const resolvedX =
      typeof rawX === "number"
        ? rawX + shiftX
        : Number.isFinite(Number(rawX))
          ? Number(rawX) + shiftX
          : rawX;
    const resolvedY = p.y ?? vb.y;
    return renderer({ x: resolvedX, y: resolvedY, value: resolvedValue });
  };
}

function CompositeTargetLineShapeFactory(shiftX: number) {
  return function CompositeTargetLineShape(props: {
    points?: ReadonlyArray<{
      x?: number | null;
      y?: number | null;
      value?: number | null;
      payload?: ChartDatum;
    }>;
    stroke?: string;
    strokeWidth?: number | string;
    strokeDasharray?: number | string;
  }) {
    const src = Array.isArray(props.points) ? props.points : [];
    const valid = src.filter(
      (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)
    ) as Array<{ x: number; y: number }>;
    if (valid.length < 2) return null;
    const d = valid
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x + shiftX},${p.y}`)
      .join(" ");
    const stroke = props.stroke ?? "#0ea5e9";
    const parsedStrokeWidth = Number(props.strokeWidth);
    const strokeWidth = Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 2;
    const strokeDasharray =
      props.strokeDasharray !== undefined ? String(props.strokeDasharray) : undefined;
    return (
      <g>
        <path
          d={d}
          fill="none"
          stroke="#ffffff"
          strokeWidth={strokeWidth + 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  };
}

function benchmarkLabel(indicatorType: KpiIndicatorType, raw: string): string {
  const parsed = parseBenchmarkValue(raw);
  return parsed !== null ? chartValueLabel(indicatorType, parsed) : raw;
}

type ChartYDomain = { min: number; max: number };

const CHART_Y_DOMAIN_DEGENERATE_EPS = 1e-9;

function computeDynamicChartYDomainFromValues(values: number[]): ChartYDomain {
  if (values.length === 0) {
    return { min: 0, max: 100 };
  }
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return { min: 0, max: 100 };
  }

  if (dataMax - dataMin < CHART_Y_DOMAIN_DEGENERATE_EPS) {
    const mid = dataMin;
    const spread = Math.max(Math.abs(mid) * 0.1, 1);
    return { min: mid - spread, max: mid + spread };
  }

  let minY = dataMin < 0 ? dataMin * 1.1 : 0;
  const maxY = dataMax > 0 ? dataMax * 1.1 : 0;

  if (dataMin >= 0 && dataMin === 0 && dataMax > dataMin) {
    const span = maxY - minY;
    const belowZero = Math.max(maxY * 0.05, span * 0.03, 1e-9);
    minY = -belowZero;
  }

  return { min: minY, max: maxY };
}

/**
 * Y축: 목표·실적·B/M에 쓰인 유효 숫자 범위에 1.1배 여유를 둔다.
 * - 양수만 있으면 상한 = max×1.1, 하한은 보통 0(아래 참)
 * - 음수만 있으면 상한 0, 하한 = min×1.1(더 음수로)
 * - 음·양 섞이면 [min×1.1, max×1.1]
 * - **차트에 들어간 모든 점**의 min === max일 때만 [mid±spread](예: 전부 0이면 대략 [-1,1]). B/M 등 하나라도 1건이면 범위가 생겨 이 규칙은 적용되지 않는다.
 * - 최솟값이 정확히 0이고 위로 값이 있는 경우: 하한을 살짝 음수로 두어 0선이 차트 맨 아래에 붙지 않게 한다.
 * chartData가 바뀌면(저장·refetch 등) 도메인도 함께 갱신된다.
 */
function computeDynamicChartYDomain(chartData: ChartDatum[]): ChartYDomain {
  const values: number[] = [];
  for (const d of chartData) {
    if (Number.isFinite(d.actual)) values.push(d.actual);
    if (d.target !== null && Number.isFinite(d.target)) values.push(d.target);
    if (
      d.targetSecondary !== null &&
      d.targetSecondary !== undefined &&
      Number.isFinite(d.targetSecondary)
    ) {
      values.push(d.targetSecondary);
    }
    if (d.barPrimary !== undefined && Number.isFinite(d.barPrimary)) {
      values.push(d.barPrimary);
    }
    if (d.barSecondary !== undefined && Number.isFinite(d.barSecondary)) {
      values.push(d.barSecondary);
    }
  }
  return computeDynamicChartYDomainFromValues(values);
}

function computeCompositeChartYDomain(
  chartData: ChartDatum[],
  series: "primary" | "secondary"
): ChartYDomain {
  const values: number[] = [];
  for (const d of chartData) {
    if (series === "primary") {
      if (d.target !== null && Number.isFinite(d.target)) values.push(d.target);
      if (d.barPrimary !== undefined && Number.isFinite(d.barPrimary)) {
        values.push(d.barPrimary);
      }
    } else {
      if (
        d.targetSecondary !== null &&
        d.targetSecondary !== undefined &&
        Number.isFinite(d.targetSecondary)
      ) {
        values.push(d.targetSecondary);
      }
      if (d.barSecondary !== undefined && Number.isFinite(d.barSecondary)) {
        values.push(d.barSecondary);
      }
    }
  }
  return computeDynamicChartYDomainFromValues(values);
}

/** Y축 눈금: 0이 도메인 안에 있으면 반드시 한 칸에 포함(0%·0건 등 단위 표기용). */
function buildYAxisTicks(min: number, max: number, segmentCount = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const span = max - min;
  if (span < CHART_Y_DOMAIN_DEGENERATE_EPS) return [min];

  const ticks: number[] = [];
  const steps = Math.max(2, segmentCount);
  for (let i = 0; i < steps; i += 1) {
    ticks.push(min + (span * i) / (steps - 1));
  }
  if (min <= 0 && max >= 0) {
    const hasNearZero = ticks.some(
      (t) => Math.abs(t) <= Math.max(1e-6, span * 1e-4)
    );
    if (!hasNearZero) ticks.push(0);
  }
  ticks.sort((a, b) => a - b);
  const dedup: number[] = [];
  const tol = Math.max(span * 0.0005, 1e-7);
  for (const t of ticks) {
    if (!dedup.some((d) => Math.abs(d - t) < tol)) dedup.push(t);
  }
  return dedup;
}

/** 디스플레이(TV)용 Y축 — 눈금을 정수 단위로만 표시 */
function buildYAxisIntegerTicks(
  min: number,
  max: number,
  targetSegments = 5
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100];
  const lo = Math.floor(min);
  const hi = Math.ceil(max);
  const range = hi - lo;
  if (range <= 0) return [lo];

  const pickStep = (span: number, segments: number): number => {
    const rough = span / Math.max(1, segments);
    const pow = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
    const normalized = rough / pow;
    const nice =
      normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * pow;
  };

  const step = pickStep(range, targetSegments);
  let start = Math.floor(lo / step) * step;
  if (min <= 0 && max >= 0) start = Math.min(start, 0);

  const ticks: number[] = [];
  for (let t = start; t <= hi + step * 0.001; t += step) {
    const rounded = Math.round(t);
    if (!ticks.includes(rounded)) ticks.push(rounded);
  }
  if (min <= 0 && max >= 0 && !ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => a - b);
  return ticks.length >= 2 ? ticks : [lo, hi];
}

/** Y축 tick 라벨 표시용 — 축 눈금에는 소수 자릿수를 최소화 */
function chartTickLabel(
  indicatorType: KpiIndicatorType,
  value: number,
  integerOnly = false
): string {
  const v = integerOnly ? Math.round(value) : value;
  if (indicatorType === "ppm") {
    return integerOnly ? `${Math.round(v)} ppm` : `${formatKoMax2Decimals(v)} ppm`;
  }
  if (indicatorType === "quantity") {
    return integerOnly ? `${Math.round(v)} k` : `${formatKoMax2Decimals(v)} k`;
  }
  if (indicatorType === "count") {
    return integerOnly ? `${Math.round(v)} 건` : `${formatKoMax2Decimals(v)} 건`;
  }
  if (indicatorType === "headcount") {
    return integerOnly ? `${Math.round(v)} 명` : `${formatKoMax2Decimals(v)} 명`;
  }
  if (isMoneyIndicatorType(indicatorType)) {
    const unit = moneyIndicatorUnitSuffix(indicatorType);
    return integerOnly ? `${Math.round(v)}${unit}` : `${formatKoMax2Decimals(v)}${unit}`;
  }
  if (indicatorType === "time") {
    return integerOnly ? `${Math.round(v)} h` : `${formatKoMax2Decimals(v)} h`;
  }
  if (indicatorType === "minutes") {
    return integerOnly ? `${Math.round(v)} min` : `${formatKoMax2Decimals(v)} min`;
  }
  if (indicatorType === "uph") {
    return integerOnly ? `${Math.round(v)} UPH` : `${formatKoMax2Decimals(v)} UPH`;
  }
  if (indicatorType === "cpk") {
    return integerOnly ? `${Math.round(v)} Cpk` : `${formatKoMax2Decimals(v)} Cpk`;
  }
  return integerOnly ? `${Math.round(v)}%` : formatKoPercentMax2(value);
}

/**
 * Y축 tick 라벨 목록 중 최대 문자 길이를 기반으로 적정 축 너비(px) 추정.
 * fontSize 11 기준 문자당 ~6.5px + tickMargin(6) + axis/tick 여유(10).
 */
function estimateYAxisWidth(
  ticks: number[],
  indicatorType: KpiIndicatorType,
  minWidth = 40,
  maxWidth = 80
): number {
  let longest = 0;
  for (const t of ticks) {
    const label = chartTickLabel(indicatorType, t);
    if (label.length > longest) longest = label.length;
  }
  const estimated = Math.ceil(longest * 6.5) + 16;
  return Math.min(maxWidth, Math.max(minWidth, estimated));
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
  if (isMoneyIndicatorType(t)) {
    return `세로축: ${moneyIndicatorKindLabel(t)}.`;
  }
  if (t === "time") return "세로축: 시간(h).";
  if (t === "minutes") return "세로축: 분(min).";
  if (t === "uph") return "세로축: 생산성(UPH).";
  if (t === "cpk") return "세로축: 공정능력 Cpk(목표·실적 동일 단위).";
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
  canEditPerformance = true,
  profileRole = null,
  profileUserId = null,
  canFinalizeKpiItem = false,
  onFinalizeKpiItem,
  canHoldDropKpiItem = false,
  onHoldDropKpiItem,
  onExtendPeriodEndMonth,
  initialEditorMonth = null,
  kioskMode = false,
  kioskDeptName,
}: Props) {
  const linkedSecondaryItem = kpiItem?.linkedSecondary ?? null;
  const perfQueryPrimary = useKpiPerformances(
    isOpen && kpiItem ? kpiItem.id : null
  );
  const perfQuerySecondary = useKpiPerformances(
    isOpen && linkedSecondaryItem ? linkedSecondaryItem.id : null
  );
  const [perfEditTarget, setPerfEditTarget] = useState<"primary" | "secondary">(
    "primary"
  );
  const [chartViewMode, setChartViewMode] =
    useState<ChartViewMode>("composite");
  const [hoveredCompositeSeries, setHoveredCompositeSeries] =
    useState<HoveredCompositeSeries>(null);
  const [focusedBubbleMonth, setFocusedBubbleMonth] =
    useState<FocusedBubbleMonth>(null);
  const [focusedBubbleKind, setFocusedBubbleKind] =
    useState<FocusedBubbleKind>(null);
  const [bubbleDisplayMode, setBubbleDisplayMode] =
    useState<BubbleDisplayMode>("none");
  const barClickHandledRef = useRef(false);
  const perfQuery =
    perfEditTarget === "secondary" && linkedSecondaryItem
      ? perfQuerySecondary
      : perfQueryPrimary;
  const saveMutation = useUpsertMonthPerformance();
  const workflowMut = useWorkflowReviewMutation();
  const withdrawMut = useWithdrawPendingPerformanceMutation();
  const deleteDraftMut = useDeleteDraftMonthlyPerformanceMutation();
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
  const [liveRowsPrimary, setLiveRowsPrimary] = useState<ItemPerformanceRow[]>(
    []
  );
  const [liveRowsSecondary, setLiveRowsSecondary] = useState<ItemPerformanceRow[]>(
    []
  );
  const liveRows =
    perfEditTarget === "secondary" && linkedSecondaryItem
      ? liveRowsSecondary
      : liveRowsPrimary;
  const liveRowsRef = useRef<ItemPerformanceRow[]>([]);
  liveRowsRef.current = liveRows;
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [holdDropModal, setHoldDropModal] = useState<{
    open: boolean;
    mode: KpiHoldDropStatus | "withdraw";
  }>({ open: false, mode: "hold" });
  const [holdDropReasonDraft, setHoldDropReasonDraft] = useState("");
  const [holdDropSubmitting, setHoldDropSubmitting] = useState(false);
  const [approvalLineModalOpen, setApprovalLineModalOpen] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<{
    rateNum: number;
    actualMetricSave?: number;
    finalizeAfterSave?: boolean;
    skipMonthConfirm?: boolean;
  } | null>(null);
  const [downloadingEvidence, setDownloadingEvidence] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });
  const [kioskMonthDetailOpen, setKioskMonthDetailOpen] = useState(false);
  const kioskBodyRef = useRef<HTMLDivElement>(null);
  const kioskMetricsRef = useRef<HTMLDivElement>(null);
  const kioskMonthDetailRef = useRef<HTMLDivElement>(null);
  const [kioskChartHeightPx, setKioskChartHeightPx] = useState(280);
  const actionConfirmResolverRef = useRef<((value: boolean) => void) | null>(
    null
  );
  const [actionConfirm, setActionConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "", message: "" });

  const resolveActionConfirm = useCallback((result: boolean) => {
    setActionConfirm((prev) => ({ ...prev, open: false }));
    const resolve = actionConfirmResolverRef.current;
    actionConfirmResolverRef.current = null;
    if (resolve) resolve(result);
  }, []);

  const requestActionConfirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      actionConfirmResolverRef.current = resolve;
      setActionConfirm({ open: true, title, message });
    });
  }, []);

  useEffect(() => {
    return () => {
      const r = actionConfirmResolverRef.current;
      if (r) {
        actionConfirmResolverRef.current = null;
        r(false);
      }
    };
  }, []);

  const editorKpiItem = useMemo(
    () =>
      perfEditTarget === "secondary" && kpiItem?.linkedSecondary
        ? kpiItem.linkedSecondary
        : kpiItem,
    [perfEditTarget, kpiItem]
  );

  const effectiveIndicatorType = useMemo(
    () =>
      editorKpiItem
        ? resolveEffectiveIndicatorTypeForUi(
            editorKpiItem.indicatorType,
            editorKpiItem.bm,
            editorKpiItem.unit
          )
        : "normal",
    [editorKpiItem]
  );

  const computedTargetMetric = useMemo(
    () =>
      editorKpiItem
        ? resolveComputedTargetMetric(
            effectiveIndicatorType,
            editorKpiItem.targetPpm,
            editorKpiItem.targetFinalValue
          )
        : null,
    [editorKpiItem, effectiveIndicatorType]
  );

  const isComputedItem = editorKpiItem
    ? indicatorUsesComputedAchievement(effectiveIndicatorType) ||
      editorKpiItem.evaluationType === "qualitative"
    : false;

  const isAdmin = isAdminRole(profileRole);
  const normalizedRole = normalizeRole(profileRole);
  const isPrivilegedEditor =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader" ||
    normalizedRole === "group_team_leader";
  const canFinalComplete = canFinalizeKpiItem && isPrivilegedEditor;
  const canHoldDrop = canHoldDropKpiItem && isPrivilegedEditor;
  const headerHoldDropStatus = isKpiHoldDropActive(kpiItem?.holdDropStatus)
    ? (kpiItem?.holdDropStatus ?? null)
    : null;
  const headerHoldDropReason = kpiItem?.holdDropReason?.trim() || null;

  const activeMonthListPrimary = useMemo(() => {
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

  const activeMonthListSecondary = useMemo(() => {
    if (!linkedSecondaryItem) return [] as MonthKey[];
    const startMonth = linkedSecondaryItem.periodStartMonth;
    const endMonth = linkedSecondaryItem.periodEndMonth;
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
      linkedSecondaryItem.h1TargetDate,
      linkedSecondaryItem.h2TargetDate
    );
    return activeMonthsForSchedule(sched);
  }, [
    linkedSecondaryItem?.h1TargetDate,
    linkedSecondaryItem?.h2TargetDate,
    linkedSecondaryItem?.periodStartMonth,
    linkedSecondaryItem?.periodEndMonth,
  ]);

  const activeMonthList = useMemo(() => {
    if (!kpiItem) return [] as MonthKey[];
    if (!linkedSecondaryItem || activeMonthListSecondary.length === 0) {
      return activeMonthListPrimary;
    }
    const u = new Set<MonthKey>([
      ...activeMonthListPrimary,
      ...activeMonthListSecondary,
    ]);
    return [...u].sort((a, b) => a - b);
  }, [
    kpiItem,
    linkedSecondaryItem,
    activeMonthListPrimary,
    activeMonthListSecondary,
  ]);

  const displayMonthList = useMemo(() => {
    if (!kpiItem || activeMonthList.length === 0) return [] as MonthKey[];
    return activeMonthList;
  }, [kpiItem, activeMonthList]);

  const activeSet = useMemo(
    () => new Set<MonthKey>(displayMonthList),
    [displayMonthList]
  );

  /** 차트·주 목표 시리즈는 편집 중인 목표(1·2)와 무관하게 항상 주 KPI 기준 */
  const normalMonthlyContextPrimary = useMemo((): NormalMonthlyTargetContext | null => {
    if (!kpiItem || activeMonthListPrimary.length === 0) return null;
    return {
      activeFirstMonth: activeMonthListPrimary[0]!,
      activeLastMonth:
        activeMonthListPrimary[activeMonthListPrimary.length - 1]!,
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
  }, [kpiItem, activeMonthListPrimary]);

  const effectiveIndicatorTypePrimary = useMemo(
    () =>
      kpiItem
        ? resolveEffectiveIndicatorTypeForUi(
            kpiItem.indicatorType,
            kpiItem.bm,
            kpiItem.unit
          )
        : "normal",
    [kpiItem]
  );

  const computedTargetMetricPrimary = useMemo(
    () =>
      kpiItem
        ? resolveComputedTargetMetric(
            effectiveIndicatorTypePrimary,
            kpiItem.targetPpm,
            kpiItem.targetFinalValue
          )
        : null,
    [kpiItem, effectiveIndicatorTypePrimary]
  );

  const displayedFinalTargetValuePrimary = useMemo(() => {
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

  const periodOverallAchievementContext = useMemo(() => {
    if (!kpiItem) return null;
    return buildPerformanceUiAchievementContext({
      indicatorType: effectiveIndicatorTypePrimary,
      evaluationType: kpiItem.evaluationType,
      qualitativeCalcType: kpiItem.qualitativeCalcType,
      targetDirection: kpiItem.targetDirection,
      aggregationType: kpiItem.aggregationType,
      targetFillPolicy: kpiItem.targetFillPolicy,
      achievementCap: kpiItem.achievementCap,
      monthlyTargets: kpiItem.monthlyTargets,
      computedTargetMetric: computedTargetMetricPrimary,
      normalMonthlyContext: normalMonthlyContextPrimary,
    });
  }, [
    kpiItem,
    effectiveIndicatorTypePrimary,
    computedTargetMetricPrimary,
    normalMonthlyContextPrimary,
  ]);

  const livePeriodOverallAchievement = useMemo(() => {
    if (!kpiItem || !periodOverallAchievementContext) return null;
    const cells = performanceMonthlyCellsFromRows(
      liveRowsPrimary.flatMap((row) => {
        const month = halfTypeLabelToMonth(row.half_type);
        if (month === null) return [];
        return [{ month, ...row }];
      }),
      { chartVisibleOnly: true }
    );
    return computeKpiPeriodOverallAchievementPercent({
      performanceMonthly: cells,
      ctx: periodOverallAchievementContext,
      periodStart: kpiItem.periodStartMonth,
      periodEnd: kpiItem.periodEndMonth,
    });
  }, [kpiItem, periodOverallAchievementContext, liveRowsPrimary]);

  const effectiveIndicatorTypeSecondary = useMemo(
    () =>
      linkedSecondaryItem
        ? resolveEffectiveIndicatorTypeForUi(
            linkedSecondaryItem.indicatorType,
            linkedSecondaryItem.bm,
            linkedSecondaryItem.unit
          )
        : "normal",
    [linkedSecondaryItem]
  );

  const displayedFinalTargetValueSecondary = useMemo(() => {
    if (!linkedSecondaryItem) return null;
    if (linkedSecondaryItem.aggregationType === "cumulative") {
      const values = Object.values(linkedSecondaryItem.monthlyTargets ?? {}).filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v)
      );
      if (values.length > 0) {
        return values.reduce((sum, value) => sum + value, 0);
      }
    }
    return linkedSecondaryItem.targetFinalValue;
  }, [linkedSecondaryItem]);

  const computedTargetMetricSecondary = useMemo(
    () =>
      linkedSecondaryItem
        ? resolveComputedTargetMetric(
            effectiveIndicatorTypeSecondary,
            linkedSecondaryItem.targetPpm,
            linkedSecondaryItem.targetFinalValue
          )
        : null,
    [linkedSecondaryItem, effectiveIndicatorTypeSecondary]
  );

  const normalMonthlyContextSecondary = useMemo((): NormalMonthlyTargetContext | null => {
    if (!linkedSecondaryItem || activeMonthListSecondary.length === 0) return null;
    return {
      activeFirstMonth: activeMonthListSecondary[0]!,
      activeLastMonth:
        activeMonthListSecondary[activeMonthListSecondary.length - 1]!,
      periodStartMonth: linkedSecondaryItem.periodStartMonth,
      periodEndMonth: linkedSecondaryItem.periodEndMonth,
      firstHalfTarget: linkedSecondaryItem.firstHalfTarget,
      firstHalfRate: linkedSecondaryItem.firstHalfRate,
      secondHalfTarget: linkedSecondaryItem.secondHalfTarget,
      secondHalfRate: linkedSecondaryItem.secondHalfRate,
      targetFinalValue: linkedSecondaryItem.targetFinalValue,
      challengeTarget: linkedSecondaryItem.challengeTarget,
      targetDirection: linkedSecondaryItem.targetDirection,
    };
  }, [linkedSecondaryItem, activeMonthListSecondary]);

  const dualChartAndSummaryEligible = useMemo(
    () => Boolean(linkedSecondaryItem),
    [linkedSecondaryItem]
  );

  const chartViewOptions = useMemo<Array<{ mode: ChartViewMode; label: string }>>(() => {
    if (!linkedSecondaryItem) return [] as Array<{ mode: ChartViewMode; label: string }>;
    return [
      { mode: "primary", label: "목표 1" },
      { mode: "secondary", label: "목표 2" },
      { mode: "composite", label: "종합" },
    ];
  }, [linkedSecondaryItem]);

  const activeMonthListEditor = useMemo(() => {
    if (!editorKpiItem) return [] as MonthKey[];
    const startMonth = editorKpiItem.periodStartMonth;
    const endMonth = editorKpiItem.periodEndMonth;
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
      editorKpiItem.h1TargetDate,
      editorKpiItem.h2TargetDate
    );
    return activeMonthsForSchedule(sched);
  }, [
    editorKpiItem?.h1TargetDate,
    editorKpiItem?.h2TargetDate,
    editorKpiItem?.periodStartMonth,
    editorKpiItem?.periodEndMonth,
  ]);

  const activeSetEditor = useMemo(
    () => new Set<MonthKey>(activeMonthListEditor),
    [activeMonthListEditor]
  );

  const normalMonthlyContext = useMemo((): NormalMonthlyTargetContext | null => {
    if (!editorKpiItem || activeMonthListEditor.length === 0) return null;
    return {
      activeFirstMonth: activeMonthListEditor[0]!,
      activeLastMonth: activeMonthListEditor[activeMonthListEditor.length - 1]!,
      periodStartMonth: editorKpiItem.periodStartMonth,
      periodEndMonth: editorKpiItem.periodEndMonth,
      firstHalfTarget: editorKpiItem.firstHalfTarget,
      firstHalfRate: editorKpiItem.firstHalfRate,
      secondHalfTarget: editorKpiItem.secondHalfTarget,
      secondHalfRate: editorKpiItem.secondHalfRate,
      targetFinalValue: editorKpiItem.targetFinalValue,
      challengeTarget: editorKpiItem.challengeTarget,
      targetDirection: editorKpiItem.targetDirection,
    };
  }, [editorKpiItem, activeMonthListEditor]);

  const rowByMonthPrimary = useMemo(() => {
    const m = new Map<MonthKey, ItemPerformanceRow>();
    for (const r of liveRowsPrimary) {
      const mk = halfTypeLabelToMonth(r.half_type);
      if (mk !== null && !m.has(mk)) m.set(mk, r);
    }
    return m;
  }, [liveRowsPrimary]);

  const rowByMonthSecondary = useMemo(() => {
    const m = new Map<MonthKey, ItemPerformanceRow>();
    for (const r of liveRowsSecondary) {
      const mk = halfTypeLabelToMonth(r.half_type);
      if (mk !== null && !m.has(mk)) m.set(mk, r);
    }
    return m;
  }, [liveRowsSecondary]);

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
      !editorKpiItem ||
      editorKpiItem.targetDirection === "na"
    ) {
      return null;
    }
    const monthlyMap = editorKpiItem.monthlyTargets ?? {};
    if (editorAggregationType === "cumulative") {
      return (
        cumulativeTargetThroughMonth(monthlyMap, editorMonth) ??
        resolveNormalMonthlyTargetMetric(editorMonth, normalMonthlyContext)
      );
    }
    const fromMap = resolveMonthlyTargetForMonth(
      monthlyMap,
      editorMonth,
      editorKpiItem.targetFillPolicy
    );
    const t =
      typeof fromMap === "number" && Number.isFinite(fromMap)
        ? fromMap
        : resolveNormalMonthlyTargetMetric(editorMonth, normalMonthlyContext);
    return t >= 0 ? t : null;
  }, [
    effectiveIndicatorType,
    normalMonthlyContext,
    editorMonth,
    editorKpiItem,
    editorAggregationType,
  ]);

  const computedMonthlyTargetEditor = useMemo(() => {
    if (!isComputedItem || !editorKpiItem) return null;
    if (editorAggregationType === "cumulative") {
      return (
        cumulativeTargetThroughMonth(editorKpiItem.monthlyTargets, editorMonth) ??
        computedTargetMetric
      );
    }
    const fromMonthly = resolveMonthlyTargetForMonth(
      editorKpiItem.monthlyTargets,
      editorMonth,
      editorKpiItem.targetFillPolicy
    );
    if (fromMonthly !== null) return fromMonthly;
    return computedTargetMetric;
  }, [isComputedItem, editorKpiItem, editorMonth, computedTargetMetric, editorAggregationType]);

  const displayedFinalTargetValue = useMemo(() => {
    if (!editorKpiItem) return null;
    if (editorKpiItem.aggregationType === "cumulative") {
      const values = Object.values(editorKpiItem.monthlyTargets ?? {}).filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v)
      );
      if (values.length > 0) {
        return values.reduce((sum, value) => sum + value, 0);
      }
    }
    return editorKpiItem.targetFinalValue;
  }, [editorKpiItem]);

  const normalMetricEntryActive = Boolean(
    effectiveIndicatorType === "normal" &&
      editorKpiItem &&
      editorKpiItem.targetDirection !== "na" &&
      normalMonthlyTargetEditor !== null &&
      normalMonthlyTargetEditor >= 0
  );

  const computedEditorPreviewPercent = useMemo(() => {
    if (
      isComputedItem &&
      editorKpiItem &&
      computedMonthlyTargetEditor !== null &&
      computedMonthlyTargetEditor >= 0
    ) {
      const ap = parseNonNegativeDecimal(editorActualPpm);
      return computeEditorPreviewAchievementPercent({
        indicatorType: effectiveIndicatorType,
        evaluationType: editorKpiItem.evaluationType,
        qualitativeCalcType: editorKpiItem.qualitativeCalcType,
        targetDirection: editorKpiItem.targetDirection,
        achievementCap: editorKpiItem.achievementCap,
        aggregationType: editorAggregationType,
        monthlyTarget: computedMonthlyTargetEditor,
        draftActual: ap,
        rowByMonth,
        monthList: displayMonthList,
        editorMonth,
      });
    }
    if (
      normalMetricEntryActive &&
      editorKpiItem &&
      normalMonthlyTargetEditor !== null &&
      normalMonthlyTargetEditor >= 0
    ) {
      const ap = parseNonNegativeDecimal(editorRate);
      return computeEditorPreviewAchievementPercent({
        indicatorType: "normal",
        evaluationType: editorKpiItem.evaluationType,
        qualitativeCalcType: editorKpiItem.qualitativeCalcType,
        targetDirection: editorKpiItem.targetDirection,
        achievementCap: editorKpiItem.achievementCap,
        aggregationType: editorAggregationType,
        monthlyTarget: normalMonthlyTargetEditor,
        draftActual: ap,
        rowByMonth,
        monthList: displayMonthList,
        editorMonth,
      });
    }
    return null;
  }, [
    isComputedItem,
    editorKpiItem,
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

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const firstActive = activeMonthList[0] ?? KPI_MONTHS[0]!;
    const prefer =
      initialEditorMonth != null && activeMonthList.includes(initialEditorMonth)
        ? initialEditorMonth
        : firstActive;
    setSelectedMonth(prefer);
    setEditorMonth(prefer);
  }, [isOpen, kpiItem, canEditPerformance, activeMonthList, initialEditorMonth]);

  useEffect(() => {
    if (kioskMode) setKioskMonthDetailOpen(false);
  }, [kioskMode, kpiItem?.id]);

  const remeasureKioskChartHeight = useCallback(() => {
    if (!kioskMode || kioskMonthDetailOpen) return;
    const body = kioskBodyRef.current;
    if (!body) return;
    const metricsEl = kioskMetricsRef.current;
    const monthEl = kioskMonthDetailRef.current;
    const style = getComputedStyle(body);
    const paddingY =
      (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const metricsH = metricsEl?.offsetHeight ?? 0;
    const monthH = monthEl?.offsetHeight ?? 0;
    const available =
      body.clientHeight -
      paddingY -
      metricsH -
      monthH -
      KIOSK_METRICS_GAP_PX -
      KIOSK_CHART_GAP_PX;
    setKioskChartHeightPx(
      Math.max(KIOSK_CHART_MIN_HEIGHT_PX, Math.floor(available))
    );
  }, [kioskMode, kioskMonthDetailOpen]);

  useLayoutEffect(() => {
    if (!kioskMode || kioskMonthDetailOpen) return;
    remeasureKioskChartHeight();
    const body = kioskBodyRef.current;
    if (!body) return;
    const ro = new ResizeObserver(() => remeasureKioskChartHeight());
    ro.observe(body);
    if (kioskMetricsRef.current) ro.observe(kioskMetricsRef.current);
    if (kioskMonthDetailRef.current) ro.observe(kioskMonthDetailRef.current);
    window.addEventListener("resize", remeasureKioskChartHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", remeasureKioskChartHeight);
    };
  }, [
    kioskMode,
    kioskMonthDetailOpen,
    remeasureKioskChartHeight,
    kpiItem?.id,
    linkedSecondaryItem?.id,
    kpiItem?.isFinalCompleted,
  ]);

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    setLiveRowsPrimary(perfQueryPrimary.data ?? []);
  }, [isOpen, kpiItem, perfQueryPrimary.data]);

  useEffect(() => {
    if (!isOpen || !linkedSecondaryItem) return;
    setLiveRowsSecondary(perfQuerySecondary.data ?? []);
  }, [isOpen, linkedSecondaryItem, perfQuerySecondary.data]);

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    setPerfEditTarget("primary");
    setChartViewMode(dualChartAndSummaryEligible ? "composite" : "primary");
    setHoveredCompositeSeries(null);
    setFocusedBubbleMonth(null);
    setFocusedBubbleKind(null);
    setBubbleDisplayMode("none");
  }, [isOpen, kpiItem?.id, linkedSecondaryItem?.id, dualChartAndSummaryEligible]);

  useEffect(() => {
    if (!linkedSecondaryItem) return;
    if (chartViewMode === "primary") setPerfEditTarget("primary");
    else if (chartViewMode === "secondary") setPerfEditTarget("secondary");
  }, [chartViewMode, linkedSecondaryItem]);

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

    const dualEligible = dualChartAndSummaryEligible;
    const hasSecondaryChart = Boolean(linkedSecondaryItem);
    const modeComposite =
      Boolean(linkedSecondaryItem) && dualEligible && chartViewMode === "composite";

    const chartMonths = !hasSecondaryChart
      ? displayMonthList
      : chartViewMode === "primary" || (chartViewMode === "composite" && !modeComposite)
        ? activeMonthListPrimary
        : chartViewMode === "secondary"
          ? activeMonthListSecondary
          : displayMonthList;

    const sliceItem: KpiModalItem =
      hasSecondaryChart && chartViewMode === "secondary" && linkedSecondaryItem
        ? linkedSecondaryItem
        : kpiItem;

    const rowMap =
      hasSecondaryChart && chartViewMode === "secondary"
        ? rowByMonthSecondary
        : rowByMonthPrimary;

    const sliceEffType: KpiIndicatorType =
      hasSecondaryChart && chartViewMode === "secondary"
        ? effectiveIndicatorTypeSecondary
        : effectiveIndicatorTypePrimary;

    const normMonthlyCtx =
      hasSecondaryChart && chartViewMode === "secondary"
        ? normalMonthlyContextSecondary
        : normalMonthlyContextPrimary;

    const computedTargetMetric =
      hasSecondaryChart && chartViewMode === "secondary"
        ? computedTargetMetricSecondary
        : computedTargetMetricPrimary;

    const dispFinalTarget =
      hasSecondaryChart && chartViewMode === "secondary"
        ? displayedFinalTargetValueSecondary
        : displayedFinalTargetValuePrimary;

    const series: ChartDatum[] = chartMonths.map((m) => {
      const row = rowMap.get(m);
      const copied = row
        ? null
        : findLatestPriorRowWithSubmittedValue(rowMap, m, chartMonths);
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
      const { actual, target, submittedPercent } = computeMonthPerformanceSlice(
        m,
        chartMonths,
        sliceItem,
        rowMap,
        sliceEffType,
        normMonthlyCtx,
        computedTargetMetric
      );

      const description = row?.description ?? null;
      const bubbleNote = row?.bubble_note ?? sourceRow?.bubble_note ?? null;
      const targetNote = sliceItem.monthlyTargetNotes?.[m] ?? null;

      const showBarTopLabel =
        visibleOnChart ||
        monthHasSubmittedPerformanceInput(sliceEffType, row, rawSubmitted);
      const topLabel = chartBarTopLabel(
        sliceEffType,
        showBarTopLabel,
        actual,
        rawSubmitted
      );
      const base: ChartDatum = {
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
          sliceItem.challengeTarget !== null &&
          sliceItem.challengeTarget !== undefined &&
          submittedPercent >= sliceItem.challengeTarget,
        ...(copied ? { copiedFromMonth: copied.month } : {}),
        ...(topLabel ? { barTopLabel: topLabel } : {}),
      };
      if (bubbleNote?.trim()) {
        base.commentLabel = bubbleNote.trim();
      }
      if (targetNote?.trim()) {
        base.targetNoteLabel = targetNote.trim();
      }

      if (modeComposite && linkedSecondaryItem) {
        const secondarySlice = computeMonthPerformanceSlice(
          m,
          chartMonths,
          linkedSecondaryItem,
          rowByMonthSecondary,
          effectiveIndicatorTypeSecondary,
          normalMonthlyContextSecondary,
          computedTargetMetricSecondary
        );
        const targetSecondary = resolveMonthlyChartTargetLine(
          m,
          linkedSecondaryItem,
          rowByMonthSecondary.get(m),
          effectiveIndicatorTypeSecondary,
          normalMonthlyContextSecondary,
          computedTargetMetricSecondary
        );
        const rowS = rowByMonthSecondary.get(m);
        const copiedS = rowS
          ? null
          : findLatestPriorRowWithSubmittedValue(rowByMonthSecondary, m, chartMonths);
        const sourceRowS = rowS ?? copiedS?.row ?? null;
        const secNoteRaw = linkedSecondaryItem.monthlyTargetNotes?.[m]?.trim() ?? "";
        const secCommentRaw = sourceRowS?.bubble_note?.trim() ?? "";
        const pPct = base.submittedPercent;
        const sPct = secondarySlice.submittedPercent;
        const pOk =
          pPct !== null &&
          pPct !== undefined &&
          Number.isFinite(Number(pPct));
        const sOk =
          sPct !== null &&
          sPct !== undefined &&
          Number.isFinite(Number(sPct));
        let compositeAchievementPercent: number | null = null;
        if (pOk && sOk) {
          compositeAchievementPercent = (Number(pPct) + Number(sPct)) / 2;
        } else if (pOk) {
          compositeAchievementPercent = Number(pPct);
        } else if (sOk) {
          compositeAchievementPercent = Number(sPct);
        }
        const nextComposite: ChartDatum = {
          ...base,
          submittedPercent: compositeAchievementPercent,
          compositeAchievementGoal1Percent: pOk ? Number(pPct) : null,
          barPrimary: base.actual,
          barSecondary: secondarySlice.actual,
          submittedPercentSecondary: secondarySlice.submittedPercent,
          actual: Math.max(base.actual, secondarySlice.actual),
          targetSecondary,
        };
        if (secCommentRaw) {
          nextComposite.commentLabelSecondary = secCommentRaw;
        }
        if (secNoteRaw) {
          nextComposite.targetNoteSecondaryLabel = secNoteRaw;
        }
        return nextComposite;
      }

      return base;
    });

    if (modeComposite && linkedSecondaryItem) {
      const hasPrimaryBm = Boolean(kpiItem.bm && kpiItem.bm !== "-");
      const hasSecondaryBm = Boolean(
        linkedSecondaryItem.bm && linkedSecondaryItem.bm !== "-"
      );
      const bmPrefix: ChartDatum[] = [];
      if (hasPrimaryBm || hasSecondaryBm) {
        const v1 = hasPrimaryBm
          ? (() => {
              const parsed = parseBenchmarkValue(kpiItem.bm);
              if (parsed !== null) return parsed;
              const df = displayedFinalTargetValuePrimary;
              return df !== null &&
                df !== undefined &&
                Number.isFinite(df)
                ? df
                : 0;
            })()
          : 0;
        const v2 = hasSecondaryBm
          ? (() => {
              const parsed = parseBenchmarkValue(linkedSecondaryItem.bm);
              if (parsed !== null) return parsed;
              const df = displayedFinalTargetValueSecondary;
              return df !== null &&
                df !== undefined &&
                Number.isFinite(df)
                ? df
                : 0;
            })()
          : 0;
        bmPrefix.push({
          periodLabel: "B/M",
          month: 0,
          target: null,
          targetSecondary: null,
          actual: Math.max(v1, v2),
          submittedPercent: null,
          description: "전년실적 또는 벤치마크 기준",
          bubbleNote: null,
          evidence_url: null,
          hasComment: false,
          challengeMet: false,
          isBenchmark: true,
          barPrimary: v1,
          barSecondary: v2,
          bmPrimaryText: hasPrimaryBm ? kpiItem.bm.trim() : "",
          bmSecondaryText: hasSecondaryBm ? linkedSecondaryItem.bm.trim() : "",
        });
      }
      return [...bmPrefix, ...series];
    }

    const benchmarkNumber = parseBenchmarkValue(sliceItem.bm);
    const benchmarkBarValue =
      benchmarkNumber ??
      (dispFinalTarget !== null &&
      dispFinalTarget !== undefined &&
      Number.isFinite(dispFinalTarget)
        ? dispFinalTarget
        : 0);
    const benchmarkRow: ChartDatum | null =
      sliceItem.bm && sliceItem.bm !== "-"
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
            barTopLabel: benchmarkLabel(sliceEffType, sliceItem.bm),
          }
        : null;
    return benchmarkRow ? [benchmarkRow, ...series] : series;
  }, [
    kpiItem,
    linkedSecondaryItem,
    dualChartAndSummaryEligible,
    chartViewMode,
    activeMonthListPrimary,
    activeMonthListSecondary,
    displayMonthList,
    rowByMonthPrimary,
    rowByMonthSecondary,
    effectiveIndicatorTypePrimary,
    effectiveIndicatorTypeSecondary,
    computedTargetMetricPrimary,
    computedTargetMetricSecondary,
    normalMonthlyContextPrimary,
    normalMonthlyContextSecondary,
    displayedFinalTargetValuePrimary,
    displayedFinalTargetValueSecondary,
  ]);

  const chartShowsDualGroupedBars = useMemo(
    () =>
      Boolean(
        dualChartAndSummaryEligible &&
          chartViewMode === "composite" &&
          chartData.some(
            (d) => d.month !== 0 && typeof d.barPrimary === "number"
          )
      ),
    [dualChartAndSummaryEligible, chartViewMode, chartData]
  );

  const chartAxisIndicatorType: KpiIndicatorType = chartShowsDualGroupedBars
    ? effectiveIndicatorTypePrimary === effectiveIndicatorTypeSecondary
      ? effectiveIndicatorTypePrimary
      : "normal"
    : linkedSecondaryItem && chartViewMode === "secondary"
      ? effectiveIndicatorTypeSecondary
      : effectiveIndicatorTypePrimary;

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const months = !linkedSecondaryItem
      ? displayMonthList
      : chartViewMode === "primary" ||
          (chartViewMode === "composite" && !dualChartAndSummaryEligible)
        ? activeMonthListPrimary
        : chartViewMode === "secondary"
          ? activeMonthListSecondary
          : displayMonthList;
    if (months.length === 0) return;
    if (!months.includes(selectedMonth)) {
      const first = months[0]!;
      setSelectedMonth(first);
      setEditorMonth(first);
    }
  }, [
    isOpen,
    kpiItem,
    dualChartAndSummaryEligible,
    linkedSecondaryItem,
    chartViewMode,
    displayMonthList,
    activeMonthListPrimary,
    activeMonthListSecondary,
    selectedMonth,
  ]);

  const chartYDomain = useMemo((): ChartYDomain => {
    if (!kpiItem) return { min: 0, max: 100 };
    return chartShowsDualGroupedBars
      ? computeCompositeChartYDomain(chartData, "primary")
      : computeDynamicChartYDomain(chartData);
  }, [kpiItem, chartData, chartShowsDualGroupedBars]);

  const chartYDomainSecondary = useMemo((): ChartYDomain => {
    if (!kpiItem) return { min: 0, max: 100 };
    return chartShowsDualGroupedBars
      ? computeCompositeChartYDomain(chartData, "secondary")
      : chartYDomain;
  }, [kpiItem, chartData, chartShowsDualGroupedBars, chartYDomain]);

  const yAxisTicks = useMemo(
    () =>
      kioskMode
        ? buildYAxisIntegerTicks(chartYDomain.min, chartYDomain.max)
        : buildYAxisTicks(chartYDomain.min, chartYDomain.max),
    [chartYDomain.min, chartYDomain.max, kioskMode]
  );
  const yAxisTicksSecondary = useMemo(
    () =>
      kioskMode
        ? buildYAxisIntegerTicks(chartYDomainSecondary.min, chartYDomainSecondary.max)
        : buildYAxisTicks(chartYDomainSecondary.min, chartYDomainSecondary.max),
    [chartYDomainSecondary.min, chartYDomainSecondary.max, kioskMode]
  );

  const kioskChartAxisFontSize = kioskMode ? 13 : 11;
  const kioskChartBarMaxSize = kioskMode ? 58 : 44;
  const kioskChartBarCategoryGap = kioskMode ? 2 : 10;
  const kioskChartBarLabelFontSize = kioskMode ? 12 : 10;
  const ActualBarShape = useMemo(
    () => (props: Parameters<typeof ActualPerformanceBarShape>[0]) =>
      ActualPerformanceBarShape(props, kioskChartBarLabelFontSize),
    [kioskChartBarLabelFontSize]
  );

  const yAxisWidth = useMemo(
    () =>
      chartShowsDualGroupedBars
        ? estimateYAxisWidth(
            yAxisTicks,
            chartAxisIndicatorType,
            kioskMode ? 56 : 52,
            kioskMode ? 88 : 80
          )
        : estimateYAxisWidth(
            yAxisTicks,
            chartAxisIndicatorType,
            kioskMode ? 50 : 44,
            kioskMode ? 88 : 72
          ),
    [yAxisTicks, chartAxisIndicatorType, chartShowsDualGroupedBars, kioskMode]
  );
  const yAxisWidthSecondary = useMemo(
    () =>
      chartShowsDualGroupedBars
        ? estimateYAxisWidth(
            yAxisTicksSecondary,
            effectiveIndicatorTypeSecondary,
            58,
            80
          )
        : 0,
    [yAxisTicksSecondary, effectiveIndicatorTypeSecondary, chartShowsDualGroupedBars]
  );

  const hasTargetNoteLabels = useMemo(
    () =>
      chartData.some(
        (d) => typeof d.targetNoteLabel === "string" && d.targetNoteLabel.trim()
      ),
    [chartData]
  );
  const hasTargetNoteLabelsSecondary = useMemo(
    () =>
      chartData.some(
        (d) =>
          typeof d.targetNoteSecondaryLabel === "string" &&
          d.targetNoteSecondaryLabel.trim()
      ),
    [chartData]
  );
  const selectedRow = rowByMonth.get(selectedMonth) ?? null;
  const selectedChartDatum =
    chartData.find((d) => d.month === selectedMonth && !d.isBenchmark) ?? null;
  const selectedSubmittedPercent = selectedChartDatum?.submittedPercent ?? null;
  const selectedAggregationType = resolvePerformanceAggregationType(
    selectedRow,
    editorKpiItem?.aggregationType
  );
  const chartActualSelected =
    chartData.find((d) => d.month === selectedMonth && !d.isBenchmark)?.actual ?? 0;
  const selectedDescription = selectedRow?.description ?? null;
  const selectedEvidenceStored =
    selectedRow?.evidence_path ??
    selectedRow?.evidence_url ??
    null;
  const originalNames = selectedRow?.evidence_original_filenames;
  const selectedEvidenceItems = (
    selectedRow?.evidence_paths?.length
      ? selectedRow.evidence_paths
      : selectedRow?.evidence_urls?.length
        ? selectedRow.evidence_urls
        : selectedEvidenceStored
          ? [selectedEvidenceStored]
          : []
  )
    .map((storedValue, idx) => ({
      storedValue,
      path: evidencePathFromStoredValue(storedValue),
      fileName:
        originalNames?.[idx]?.trim() ||
        evidenceFileNameFromStoredValue(storedValue),
    }))
    .filter((item) => Boolean(item.path));
  const selectedStatus = selectedRow?.approval_step ?? null;
  const selectedRejectionReason = selectedRow?.rejection_reason ?? null;
  const focusedSavedCommentPrimary =
    focusedBubbleMonth !== null
      ? (rowByMonthPrimary.get(focusedBubbleMonth)?.bubble_note ??
        findLatestPriorRowWithSubmittedValue(
          rowByMonthPrimary,
          focusedBubbleMonth,
          displayMonthList
        )?.row?.bubble_note ??
        "")
      : "";
  const focusedSavedCommentSecondary =
    focusedBubbleMonth !== null
      ? (rowByMonthSecondary.get(focusedBubbleMonth)?.bubble_note ??
        findLatestPriorRowWithSubmittedValue(
          rowByMonthSecondary,
          focusedBubbleMonth,
          displayMonthList
        )?.row?.bubble_note ??
        "")
      : "";
  const focusedDraftCommentPrimary =
    focusedBubbleMonth !== null &&
    selectedMonth === focusedBubbleMonth &&
    focusedBubbleKind === "primary"
      ? editorBubbleNote || focusedSavedCommentPrimary
      : focusedSavedCommentPrimary;
  const focusedDraftCommentSecondary =
    focusedBubbleMonth !== null &&
    selectedMonth === focusedBubbleMonth &&
    focusedBubbleKind === "secondary"
      ? editorBubbleNote || focusedSavedCommentSecondary
      : focusedSavedCommentSecondary;

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

  async function handleDownloadEvidence(
    storedValue: string,
    downloadFileName?: string | null
  ) {
    if (!storedValue) {
      notify("info", "첨부 파일이 없습니다.");
      return;
    }
    const relPath = evidencePathFromStoredValue(storedValue);
    if (!relPath) {
      notify("error", "다운로드용 저장 경로를 확인할 수 없습니다.");
      return;
    }
    const preferredName =
      (downloadFileName?.trim() && downloadFileName.trim()) ||
      evidenceFileNameFromStoredValue(storedValue);

    let downloadWindow: Window | null = null;
    try {
      setDownloadingEvidence(true);
      notify("info", `${preferredName} 파일을 준비 중입니다.`);
      downloadWindow = window.open("about:blank", "_blank");
      if (downloadWindow) downloadWindow.opener = null;
      const signedUrl = await requestEvidenceSignedUrl(relPath);
      if (downloadWindow) {
        downloadWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      downloadWindow?.close();
      notify("error", e instanceof Error ? e.message : "파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadingEvidence(false);
    }
  }

  const workflowPrimaryVisible = useMemo(() => {
    if (!selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    const line = selectedRow.approval_line;
    if (line && line.length > 0) {
      const idx = selectedRow.approval_line_index ?? 0;
      const nextId = line[idx]?.user_id?.trim() ?? "";
      const isNext =
        Boolean(profileUserId?.trim()) &&
        nextId === (profileUserId?.trim() ?? "");
      const isLast = idx >= line.length - 1;
      return (
        isNext &&
        !isLast &&
        (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING)
      );
    }
    if (!profileRole) return false;
    return (
      canGroupLeaderApprove(profileRole) &&
      (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING)
    );
  }, [
    profileRole,
    profileUserId,
    selectedRow?.id,
    selectedRow?.approval_line,
    selectedRow?.approval_line_index,
    selectedStatus,
  ]);

  const workflowFinalVisible = useMemo(() => {
    if (!selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    const line = selectedRow.approval_line;
    if (line && line.length > 0) {
      const idx = selectedRow.approval_line_index ?? 0;
      const nextId = line[idx]?.user_id?.trim() ?? "";
      const isNext =
        Boolean(profileUserId?.trim()) &&
        nextId === (profileUserId?.trim() ?? "");
      const isLast = idx >= line.length - 1;
      return isNext && isLast && st === PERF_STATUS_PENDING_FINAL;
    }
    if (!profileRole) return false;
    return (
      canTeamLeaderFinalApprove(profileRole) && st === PERF_STATUS_PENDING_FINAL
    );
  }, [
    profileRole,
    profileUserId,
    selectedRow?.id,
    selectedRow?.approval_line,
    selectedRow?.approval_line_index,
    selectedStatus,
  ]);

  const canWithdrawPendingSubmission = useMemo(() => {
    if (!profileUserId?.trim() || !selectedRow?.id || !canEditPerformance) {
      return false;
    }
    const st = (selectedStatus ?? "").trim().toLowerCase();
    const pending =
      st === PERF_STATUS_PENDING_PRIMARY ||
      st === PERF_STATUS_PENDING_FINAL ||
      st === PERF_LEGACY_PENDING;
    if (!pending) return false;
    const sub = selectedRow.submitted_by?.trim() ?? "";
    return sub.length > 0 && sub === profileUserId;
  }, [
    profileUserId,
    selectedRow?.id,
    selectedRow?.submitted_by,
    selectedStatus,
    canEditPerformance,
  ]);

  /** 저장 확인·주 버튼 — 반려·회수 재제출이면 '재등록' 카피 */
  const editorMonthIsReregisterContext = useMemo(
    () =>
      isDraftRowReregisterContext(
        rowByMonth.get(editorMonth),
        profileUserId
      ),
    [editorMonth, rowByMonth, profileUserId]
  );

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
      const rows = liveRowsRef.current;
      const rb = buildRowByMonthMap(rows);
      const row = findRowByMonth(rows, mo);
      const copied = row
        ? null
        : findLatestPriorRowWithSubmittedValue(rb, mo, displayMonthList);
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
        resolvePerformanceAggregationType(row, editorKpiItem?.aggregationType)
      );
    },
    [normalMetricEntryActive, displayMonthList, editorKpiItem?.aggregationType]
  );

  /** 편집 월만 바뀔 때 대기 중인 첨부 초기화(실적 쿼리 30초 refetch 때는 유지) */
  const prevEditorMonthForPendingFilesRef = useRef<MonthKey | null>(null);
  useEffect(() => {
    if (!canEditPerformance) {
      prevEditorMonthForPendingFilesRef.current = null;
      return;
    }
    const prev = prevEditorMonthForPendingFilesRef.current;
    if (prev !== null && prev !== editorMonth) {
      setEditorFiles([]);
    }
    prevEditorMonthForPendingFilesRef.current = editorMonth;
  }, [canEditPerformance, editorMonth]);

  /** KPI·편집월·모달 열림 조합당 1회 폼 로드 (실적 refetch 시에는 재동기화하지 않음 — 입력·첨부 유지) */
  const editorFormBootstrapKeyRef = useRef<string | null>(null);

  useEffect(() => {
    editorFormBootstrapKeyRef.current = null;
  }, [perfEditTarget]);

  useEffect(() => {
    if (!isOpen) {
      editorFormBootstrapKeyRef.current = null;
      return;
    }
    if (!canEditPerformance || !kpiItem) return;
    const perfReady =
      perfQueryPrimary.isSuccess &&
      (!linkedSecondaryItem || perfQuerySecondary.isSuccess);
    if (!perfReady) return;
    const editorId =
      perfEditTarget === "secondary" && linkedSecondaryItem
        ? linkedSecondaryItem.id
        : kpiItem.id;
    const key = `${editorId}:${editorMonth}`;
    if (editorFormBootstrapKeyRef.current === key) return;
    editorFormBootstrapKeyRef.current = key;
    syncEditorFromMonth(editorMonth);
  }, [
    isOpen,
    canEditPerformance,
    editorMonth,
    kpiItem?.id,
    perfEditTarget,
    linkedSecondaryItem?.id,
    perfQueryPrimary.isSuccess,
    perfQuerySecondary.isSuccess,
    linkedSecondaryItem,
    syncEditorFromMonth,
  ]);

  /** 입력 중인 목표의 평가 구간에 맞게 편집 월 보정 */
  useEffect(() => {
    if (!canEditPerformance) return;
    if (!activeMonthListEditor.length) return;
    if (!activeSetEditor.has(editorMonth)) {
      const first = activeMonthListEditor[0]!;
      setEditorMonth(first);
      setSelectedMonth(first);
    }
  }, [
    canEditPerformance,
    activeMonthListEditor,
    activeSetEditor,
    editorMonth,
    perfEditTarget,
  ]);

  const editorMonthHasExistingSavedInput = useMemo(
    () =>
      isOpen && kpiItem
        ? rowHasSavedPerformanceInput(
            liveRows,
            editorMonth,
            effectiveIndicatorType
          )
        : false,
    [isOpen, kpiItem, liveRows, editorMonth, effectiveIndicatorType]
  );

  const headerOverallAchievementUi = useMemo(() => {
    if (!kpiItem) {
      return {
        barWidth: 0,
        lineMain: "—",
        lineSub: "",
        completedTone: false,
        holdDropTone: null as KpiHoldDropStatus | null,
        title: "전체 기간 달성률",
      };
    }
    if (isKpiHoldDropActive(kpiItem.holdDropStatus)) {
      const st = kpiItem.holdDropStatus!;
      return {
        barWidth: 100,
        lineMain: "",
        lineSub: "",
        completedTone: false,
        holdDropTone: st,
        title: st === "drop" ? "DROP" : "HOLD",
      };
    }
    if (kpiItem.isFinalCompleted) {
      return {
        barWidth: 100,
        lineMain: "",
        lineSub: "",
        completedTone: true,
        holdDropTone: null,
        title: "최종 완료",
      };
    }
    const v = livePeriodOverallAchievement ?? kpiItem.averageAchievement;
    if (v !== null && Number.isFinite(v)) {
      return {
        barWidth: Math.max(0, Math.min(100, v)),
        lineMain: formatKoPercentMax2(v),
        lineSub: "",
        completedTone: false,
        holdDropTone: null,
        title: "전체 기간 달성률",
      };
    }
    return {
      barWidth: 0,
      lineMain: "0%",
      lineSub: "",
      completedTone: false,
      holdDropTone: null,
      title: "전체 기간 달성률",
    };
  }, [kpiItem, livePeriodOverallAchievement]);

  if (!isOpen || !kpiItem) return null;
  const headerItem = kpiItem;
  const item =
    perfEditTarget === "secondary" && linkedSecondaryItem
      ? linkedSecondaryItem
      : kpiItem;

  function applyMonthSelection(
    mo: MonthKey,
    goalHint?: "primary" | "secondary",
    options?: { keepBubbles?: boolean }
  ) {
    if (linkedSecondaryItem) {
      const inP = activeMonthListPrimary.includes(mo);
      const inS = activeMonthListSecondary.includes(mo);
      if (goalHint === "primary" && inP) {
        setPerfEditTarget("primary");
      } else if (goalHint === "secondary" && inS) {
        setPerfEditTarget("secondary");
      } else if (inS && !inP) {
        setPerfEditTarget("secondary");
      } else if (inP && !inS) {
        setPerfEditTarget("primary");
      }
    }
    setSelectedMonth(mo);
    setEditorMonth(mo);
    if (options?.keepBubbles) return;
    setFocusedBubbleMonth(null);
    setFocusedBubbleKind(null);
    setBubbleDisplayMode("none");
  }

  function focusBubblesByBarClick(
    mo: MonthKey,
    goalKind: "primary" | "secondary"
  ) {
    barClickHandledRef.current = true;
    applyMonthSelection(mo, goalKind, { keepBubbles: true });
    setFocusedBubbleMonth(mo);
    setFocusedBubbleKind(goalKind);
    setBubbleDisplayMode("bar");
  }

  function focusBubblesByTargetClick(
    mo: MonthKey,
    goalKind: "primary" | "secondary"
  ) {
    barClickHandledRef.current = true;
    applyMonthSelection(mo, goalKind, { keepBubbles: true });
    setFocusedBubbleMonth(mo);
    setFocusedBubbleKind(goalKind);
    setBubbleDisplayMode("target");
  }

  function handlePerformanceBarClick(
    data: unknown,
    goalKind: "primary" | "secondary"
  ) {
    barClickHandledRef.current = true;
    const row = chartDatumFromClickData(data);
    if (!row) return;
    focusBubblesByBarClick(row.month as MonthKey, goalKind);
  }

  const currentPeriodEndMonth =
    headerItem.periodEndMonth ??
    activeMonthList[activeMonthList.length - 1] ??
    12;
  const nextDelayMonth =
    currentPeriodEndMonth < 15 ? ((currentPeriodEndMonth + 1) as MonthKey) : null;
  const canAddDelayMonth =
    canFinalComplete &&
    !headerItem.isFinalCompleted &&
    nextDelayMonth !== null &&
    typeof onExtendPeriodEndMonth === "function";

  async function handleExtendDelayMonth() {
    if (!nextDelayMonth || !onExtendPeriodEndMonth) return;
    const ok = await onExtendPeriodEndMonth(headerItem.id);
    if (!ok) return;
    applyMonthSelection(nextDelayMonth);
  }

  function followingCumulativeRateUpdates(
    currentActualValue: number | undefined
  ): Array<{ month: MonthKey; achievementRate: number }> {
    return buildFollowingCumulativeRateUpdates({
      displayMonthList,
      editorMonth,
      rowByMonth,
      currentActualValue,
      item,
      effectiveIndicatorType,
      normalMonthlyContext,
      computedTargetMetric,
    });
  }

  function editorMonthHasSavedInputForConfirm(month: MonthKey): boolean {
    return rowHasSavedPerformanceInput(
      liveRows,
      month,
      effectiveIndicatorType
    );
  }

  async function handleSaveMonth(options?: {
    finalizeAfterSave?: boolean;
    /** KPI 완료 경로 등에서 월별 등록/수정 확인 생략 */
    skipMonthConfirm?: boolean;
  }) {
    if (!canEditPerformance) {
      notify("error", "실적을 저장할 권한이 없습니다.");
      return;
    }
    if (!activeSetEditor.has(editorMonth)) {
      notify("error", "해당 월은 선택한 목표의 평가 기간에 포함되지 않습니다.");
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
      const actualForAchievement = actualForAchievementInPeriod(
        rowByMonth,
        displayMonthList,
        editorMonth,
        ap,
        editorAggregationType
      );
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
      const metric = parseNonNegativeDecimal(
        normalMonthlyActualInputForSave(isComputedItem, editorRate, editorActualPpm)
      );
      if (metric === null) {
        notify("error", "해당 월의 실적 지표값을 입력해 주세요.");
        return;
      }
      actualMetricSave = metric;
      const actualForAchievement = actualForAchievementInPeriod(
        rowByMonth,
        displayMonthList,
        editorMonth,
        metric,
        editorAggregationType
      );
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
    if (!options?.skipMonthConfirm) {
      const hasSaved = editorMonthHasSavedInputForConfirm(editorMonth);
      const ok = await requestActionConfirm(
        hasSaved
          ? editorMonthIsReregisterContext
            ? "실적 재등록"
            : "실적 수정"
          : "실적 등록",
        hasSaved
          ? editorMonthIsReregisterContext
            ? `${editorMonth}월에 이미 입력된 실적이 있습니다.\n재등록하여 저장하시겠습니까?`
            : `${editorMonth}월에 이미 입력된 실적이 있습니다.\n수정하여 저장하시겠습니까?`
          : `${editorMonth}월 실적을 등록하시겠습니까?`
      );
      if (!ok) return;
    }
    if (!editorHasEvidenceForSave) {
      notify("error", "증빙 파일을 첨부해야 실적을 등록할 수 있습니다.");
      return;
    }
    setPendingSavePayload({
      rateNum,
      ...(actualMetricSave !== undefined ? { actualMetricSave } : {}),
      finalizeAfterSave: options?.finalizeAfterSave,
      skipMonthConfirm: options?.skipMonthConfirm,
    });
    setApprovalLineModalOpen(true);
  }

  async function executeSaveWithApprovalLine(approvalLine: ApprovalLineStep[]) {
    if (!pendingSavePayload || !kpiItem) return;
    const { rateNum, actualMetricSave, finalizeAfterSave } = pendingSavePayload;
    const item =
      perfEditTarget === "secondary" && linkedSecondaryItem
        ? linkedSecondaryItem
        : kpiItem;
    const isComputed = indicatorUsesComputedAchievement(
      resolveEffectiveIndicatorTypeForUi(item.indicatorType, item.evaluationType)
    );
    setApprovalLineModalOpen(false);
    try {
      const saveResult = await saveMutation.mutateAsync({
        kpiId: item.id,
        month: editorMonth,
        achievement_rate: rateNum,
        description: editorDescription,
        bubbleNote: editorBubbleNote,
        indicatorMode: isComputed
          ? resolveEffectiveIndicatorTypeForUi(
              item.indicatorType,
              item.evaluationType
            )
          : "normal",
        achievementCap: item.achievementCap,
        ...(actualMetricSave !== undefined
          ? { actualValue: actualMetricSave }
          : {}),
        aggregationType: editorAggregationType,
        ...(isAdmin ? { adminBypassApprovalLock: true } : {}),
        actorRole: profileRole ?? null,
        approvalLine,
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
          const uploaded = await uploadEvidenceFile(targetId, file);
          uploadedPaths.push(uploaded.fullPath);
        }
        await updatePerformanceMonthlyEvidenceUrl({
          targetId,
          month: editorMonth,
          evidenceUrls: uploadedPaths,
          evidenceOriginalFilenames: editorFiles.map((f) => f.name),
        });
      }

      const followingRateUpdates =
        followingCumulativeRateUpdates(actualMetricSave);
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
      if (finalizeAfterSave) {
        if (!canFinalComplete || !onFinalizeKpiItem || headerItem.isFinalCompleted) {
          notify("error", "최종 완료 처리 권한이 없거나 이미 완료된 항목입니다.");
          return;
        }
        finalized = await onFinalizeKpiItem(headerItem.id, true);
      }

      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
      setEditorFiles([]);
      setPendingSavePayload(null);
      const lineLen = approvalLine.length;
      notify(
        "success",
        finalized
          ? `${editorMonth}월 실적 저장 및 최종 완료 처리가 완료되었습니다.`
          : lineLen === 0
            ? `${editorMonth}월 실적이 저장되었습니다. (상태: 승인 완료 — 즉시 반영)`
            : `${editorMonth}월 실적이 저장되었습니다. (결재 ${lineLen}단계 대기)`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "실적 저장에 실패했습니다."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleKpiFinalizeClick() {
    if (
      !canFinalComplete ||
      !onFinalizeKpiItem ||
      headerItem.isFinalCompleted ||
      headerHoldDropStatus
    ) {
      notify(
        "error",
        headerHoldDropStatus
          ? "Hold/Drop 상태인 KPI는 최종 완료할 수 없습니다. 먼저 상태를 철회해 주세요."
          : "최종 완료(KPI 완료) 처리는 관리자·그룹장·팀장만 가능하거나, 이미 완료된 항목입니다."
      );
      return;
    }
    const ok = await requestActionConfirm(
      "KPI 최종 완료",
      "이 KPI 항목을 최종 완료 처리하시겠습니까?\n현재 입력 내용이 저장되며, 항목이 최종 완료로 표시됩니다."
    );
    if (!ok) return;
    await handleSaveMonth({ finalizeAfterSave: true, skipMonthConfirm: true });
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
      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
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
      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
      notify("success", "최종 승인되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "최종 승인에 실패했습니다.");
    }
  }

  async function handleModalWithdrawSubmission() {
    const rid = selectedRow?.id;
    if (!rid) return;
    const hasMonthly = await getKpiTargetsHasPerformanceMonthlyColumn();
    try {
      await withdrawMut.mutateAsync({
        performanceId: rid,
        ...(hasMonthly ? { month: selectedMonth } : {}),
      });
      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
      notify(
        "success",
        "제출을 회수했습니다. 실적을 수정한 뒤 다시 제출할 수 있습니다."
      );
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "회수 처리에 실패했습니다."
      );
    }
  }

  async function handleModalDeletePerformance() {
    if (!canEditPerformance) {
      notify("error", "실적을 삭제할 권한이 없습니다.");
      return;
    }
    if (!editorMonthHasExistingSavedInput) {
      notify("error", "해당 월에 등록된 실적이 없습니다.");
      return;
    }
    const er = rowByMonth.get(editorMonth) ?? null;
    const rid = er?.id;
    if (!rid) {
      notify("error", "삭제할 실적 대상을 찾을 수 없습니다.");
      return;
    }
    const ok = await requestActionConfirm(
      "실적 삭제",
      `${editorMonth}월에 저장된 실적을 삭제합니다.\n삭제 후에는 복구할 수 없습니다. 계속하시겠습니까?`
    );
    if (!ok) return;
    try {
      const hasMonthly = await getKpiTargetsHasPerformanceMonthlyColumn();
      await deleteDraftMut.mutateAsync({
        performanceId: rid,
        ...(hasMonthly ? { month: editorMonth } : {}),
      });
      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
      setEditorRate("");
      setEditorActualPpm("");
      setEditorDescription("");
      setEditorBubbleNote("");
      setEditorFiles([]);
      notify("success", `${editorMonth}월 실적이 삭제되었습니다.`);
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "삭제 처리에 실패했습니다."
      );
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
      const r1 = await perfQueryPrimary.refetch();
      if (r1.data) setLiveRowsPrimary(r1.data);
      if (linkedSecondaryItem) {
        const r2 = await perfQuerySecondary.refetch();
        if (r2.data) setLiveRowsSecondary(r2.data);
      }
      setRejectModalOpen(false);
      setRejectReasonDraft("");
      notify("success", "반려 처리되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "반려 처리에 실패했습니다.");
    }
  }

  async function handleWithdrawFinalCompletionInModal() {
    if (!kpiItem || !canFinalComplete || !onFinalizeKpiItem) return;
    const ok = await onFinalizeKpiItem(kpiItem.id, false);
    if (!ok) return;
  }

  function openHoldDropModal(mode: KpiHoldDropStatus | "withdraw") {
    if (mode === "withdraw") {
      void submitHoldDropWithdraw();
      return;
    }
    setHoldDropReasonDraft(headerHoldDropReason ?? "");
    setHoldDropModal({ open: true, mode });
  }

  async function submitHoldDropWithdraw() {
    if (!kpiItem || !canHoldDrop || !onHoldDropKpiItem) return;
    const ok = await requestActionConfirm(
      headerHoldDropStatus === "drop" ? "Drop 철회" : "Hold 철회",
      "Hold/Drop 상태를 철회하면 달성률 집계에 다시 포함됩니다. 계속하시겠습니까?"
    );
    if (!ok) return;
    setHoldDropSubmitting(true);
    try {
      const done = await onHoldDropKpiItem(kpiItem.id, null);
      if (done) {
        notify("success", "Hold/Drop 상태가 철회되었습니다.");
      }
    } finally {
      setHoldDropSubmitting(false);
    }
  }

  async function submitHoldDropModal() {
    if (!kpiItem || !canHoldDrop || !onHoldDropKpiItem) return;
    const mode = holdDropModal.mode;
    if (mode === "withdraw") {
      await submitHoldDropWithdraw();
      return;
    }
    const reason = holdDropReasonDraft.trim();
    if (!reason) {
      notify("error", "사유를 입력해 주세요.");
      return;
    }
    setHoldDropSubmitting(true);
    try {
      const done = await onHoldDropKpiItem(kpiItem.id, mode, reason);
      if (done) {
        setHoldDropModal({ open: false, mode: "hold" });
        setHoldDropReasonDraft("");
        notify(
          "success",
          mode === "drop"
            ? "KPI가 DROP 처리되었습니다."
            : "KPI가 HOLD 처리되었습니다."
        );
      }
    } finally {
      setHoldDropSubmitting(false);
    }
  }

  if (!isOpen || !kpiItem) return null;

  const shell = (
    <>
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
      <div
        className={
          kioskMode
            ? "relative flex h-full w-full flex-col overflow-hidden bg-white"
            : "relative flex max-h-[95vh] w-full max-w-[min(100%,96rem)] flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-sky-200/50"
        }
      >
        <div
          className={
            kioskMode
              ? "relative shrink-0 border-b border-slate-700/80 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-5 py-4 text-white"
              : "relative shrink-0 border-b border-sky-200 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white"
          }
        >
          {!kioskMode ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-white/90 hover:bg-white/10 sm:right-5 sm:top-5"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
          <div
            className={`relative z-[2] flex gap-4 ${kioskMode ? "items-center justify-between" : "items-start pr-9 sm:pr-11"}`}
          >
            {kioskMode ? (
              <div className="flex w-[11.5rem] shrink-0 items-center sm:w-[13rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo_ctst_white.png"
                  alt="CTST"
                  className="h-[4.5rem] w-auto max-w-full object-contain object-left"
                />
              </div>
            ) : null}
            {!kioskMode ? (
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-snug text-sky-50 sm:text-base">
                <span
                  className="min-w-0 break-words"
                  title={`${headerItem.mainTopic} / ${headerItem.subTopic}`}
                >
                  <span>{headerItem.mainTopic}</span>
                  <span className="mx-1.5 font-normal text-sky-200/95">/</span>
                  <span>{headerItem.subTopic}</span>
                </span>
                {headerHoldDropStatus ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      headerHoldDropStatus === "drop"
                        ? "bg-rose-400/25 text-rose-50"
                        : "bg-amber-400/25 text-amber-50"
                    }`}
                  >
                    {headerHoldDropStatus === "drop" ? "DROP" : "HOLD"}
                  </span>
                ) : null}
                {headerItem.isFinalCompleted ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-400/25 px-2 py-0.5 text-xs font-semibold text-emerald-50">
                    최종 완료
                  </span>
                ) : null}
              </p>
              {linkedSecondaryItem ? (
                <p className="mt-2 text-sm font-semibold leading-snug text-white sm:text-base">
                  <span className="break-words">
                    {headerItem.detailActivity?.trim() ? headerItem.detailActivity : "—"}
                  </span>
                  <span className="mx-2 font-normal text-sky-200/90">|</span>
                  <span className="break-words">
                    {linkedSecondaryItem.detailActivity?.trim()
                      ? linkedSecondaryItem.detailActivity
                      : "—"}
                  </span>
                </p>
              ) : (
                <h3 className="mt-2 text-lg font-bold leading-snug tracking-tight text-white sm:text-xl">
                  {headerItem.detailActivity?.trim() ? headerItem.detailActivity : "—"}
                </h3>
              )}
            </div>
            ) : kioskDeptName ? (
              <p className="min-w-0 flex-1 truncate px-2 text-center text-3xl font-bold tracking-wide text-white sm:text-4xl lg:text-5xl">
                {kioskDeptName}
              </p>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            <div className="flex w-[11.5rem] shrink-0 flex-col gap-2 sm:w-[13rem]">
              {kioskMode && headerHoldDropStatus ? (
                <div
                  className={`flex min-h-[4.25rem] w-full flex-col items-center justify-center rounded-xl px-3.5 py-2.5 shadow-sm sm:px-4 ${
                    headerHoldDropStatus === "drop"
                      ? "border border-rose-300/45 bg-rose-400/20"
                      : "border border-amber-300/45 bg-amber-400/20"
                  }`}
                  role="status"
                  aria-label={headerHoldDropStatus === "drop" ? "DROP" : "HOLD"}
                >
                  <p className="text-center text-base font-bold tracking-tight text-white sm:text-lg">
                    {headerHoldDropStatus === "drop" ? "DROP" : "HOLD"}
                  </p>
                  {headerHoldDropReason ? (
                    <p
                      className={`mt-1 line-clamp-2 text-center text-[11px] font-semibold [text-shadow:0_1px_4px_rgba(0,0,0,0.45)] ${
                        headerHoldDropStatus === "drop"
                          ? "text-rose-200"
                          : "text-yellow-200"
                      }`}
                    >
                      {headerHoldDropReason}
                    </p>
                  ) : null}
                </div>
              ) : kioskMode && headerItem.isFinalCompleted ? (
                <div
                  className="flex min-h-[4.25rem] w-full flex-col items-center justify-center rounded-xl border border-emerald-300/45 bg-emerald-400/20 px-3.5 py-2.5 shadow-sm sm:px-4"
                  role="status"
                  aria-label="최종 완료"
                >
                  <p className="text-center text-base font-bold tracking-tight text-emerald-50 sm:text-lg">
                    최종 완료
                  </p>
                </div>
              ) : (
              <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 shadow-sm sm:px-4">
                <p className="text-center text-sm font-semibold leading-snug text-white sm:text-base">
                  {headerOverallAchievementUi.title}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white shadow-sm ring-1 ${
                      kioskMode ? "ring-white/15" : "ring-sky-900/15"
                    }`}
                    role="progressbar"
                    aria-valuenow={headerOverallAchievementUi.barWidth}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={headerOverallAchievementUi.title}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        headerOverallAchievementUi.holdDropTone === "drop"
                          ? "bg-gradient-to-r from-rose-400 to-rose-600"
                          : headerOverallAchievementUi.holdDropTone === "hold"
                            ? "bg-gradient-to-r from-amber-400 to-amber-600"
                            : headerOverallAchievementUi.completedTone
                              ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                              : headerOverallAchievementUi.barWidth > 0
                                ? "bg-gradient-to-r from-sky-400 to-sky-600"
                                : "bg-gradient-to-r from-sky-400 to-sky-600 opacity-40"
                      }`}
                      style={{ width: `${headerOverallAchievementUi.barWidth}%` }}
                    />
                  </div>
                  {headerOverallAchievementUi.lineMain ? (
                    <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-white sm:text-sm">
                      {headerOverallAchievementUi.lineMain}
                    </span>
                  ) : null}
                </div>
                {headerOverallAchievementUi.lineSub ? (
                  <p className="mt-1 text-center text-[10px] font-medium text-sky-100/90">
                    {headerOverallAchievementUi.lineSub}
                  </p>
                ) : null}
              </div>
              )}
            </div>
          </div>
        </div>

        {kioskMode ? (
          <div className="shrink-0 bg-gradient-to-b from-slate-50/90 via-white to-white px-5 pb-3 pt-4 sm:pb-4 sm:pt-5">
            {linkedSecondaryItem ? (
              <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
                <KpiKioskTitleBlock
                  goalLabel="목표 1"
                  tone="primary"
                  mainTopic={headerItem.mainTopic}
                  subTopic={headerItem.subTopic}
                  detailActivity={headerItem.detailActivity}
                />
                <KpiKioskTitleBlock
                  goalLabel="목표 2"
                  tone="secondary"
                  mainTopic={linkedSecondaryItem.mainTopic}
                  subTopic={linkedSecondaryItem.subTopic}
                  detailActivity={linkedSecondaryItem.detailActivity}
                />
              </div>
            ) : (
              <KpiKioskTitleBlock
                mainTopic={headerItem.mainTopic}
                subTopic={headerItem.subTopic}
                detailActivity={headerItem.detailActivity}
              />
            )}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <div
            ref={kioskMode ? kioskBodyRef : undefined}
            className={`min-h-0 min-w-0 flex-1 ${
              kioskMode
                ? `flex flex-col overflow-hidden px-5 pt-4 ${
                    kioskMonthDetailOpen ? "overflow-y-auto" : ""
                  }`
                : "overflow-y-auto p-5"
            }`}
            style={
              kioskMode
                ? { paddingBottom: `${KIOSK_FOOTER_GAP_PX}px` }
                : undefined
            }
          >

          <div
            ref={kioskMode ? kioskMetricsRef : undefined}
            className={kioskMode ? "mb-3 shrink-0" : "mb-4"}
          >
            {headerItem.needsStructureReview ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                KPI 평가 구조가 Rev02 이전 형식입니다. 수정 화면에서 평가 유형, 단위, 계산 기준, 목표 공백 처리, 달성률 상한을 확인해 저장해 주세요.
              </p>
            ) : null}
            {kioskMode && linkedSecondaryItem ? (
              <div className="flex flex-col gap-3">
                <KpiSummaryCard
                  title="목표 1"
                  item={kpiItem}
                  effectiveIndicatorType={effectiveIndicatorTypePrimary}
                  displayedFinalTargetValue={displayedFinalTargetValuePrimary}
                  kioskMode={kioskMode}
                  showKioskRowTitle
                />
                <KpiSummaryCard
                  title="목표 2"
                  item={linkedSecondaryItem}
                  effectiveIndicatorType={effectiveIndicatorTypeSecondary}
                  displayedFinalTargetValue={displayedFinalTargetValueSecondary}
                  tone="secondary"
                  kioskMode={kioskMode}
                  showKioskRowTitle
                />
              </div>
            ) : kioskMode ? (
              <KpiSummaryCard
                title={kpiSummaryCardTitle("목표 1", kpiItem)}
                item={kpiItem}
                effectiveIndicatorType={effectiveIndicatorTypePrimary}
                displayedFinalTargetValue={displayedFinalTargetValuePrimary}
                kioskMode={kioskMode}
              />
            ) : linkedSecondaryItem && chartViewMode === "composite" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <KpiSummaryCard
                  title={kpiSummaryCardTitle("목표 1", kpiItem)}
                  item={kpiItem}
                  effectiveIndicatorType={effectiveIndicatorTypePrimary}
                  displayedFinalTargetValue={displayedFinalTargetValuePrimary}
                  kioskMode={kioskMode}
                />
                <KpiSummaryCard
                  title={kpiSummaryCardTitle("목표 2", linkedSecondaryItem)}
                  item={linkedSecondaryItem}
                  effectiveIndicatorType={effectiveIndicatorTypeSecondary}
                  displayedFinalTargetValue={displayedFinalTargetValueSecondary}
                  tone="secondary"
                  kioskMode={kioskMode}
                />
              </div>
            ) : linkedSecondaryItem && chartViewMode === "secondary" ? (
              <KpiSummaryCard
                title={kpiSummaryCardTitle("목표 2", linkedSecondaryItem)}
                item={linkedSecondaryItem}
                effectiveIndicatorType={effectiveIndicatorTypeSecondary}
                displayedFinalTargetValue={displayedFinalTargetValueSecondary}
                tone="secondary"
                kioskMode={kioskMode}
              />
            ) : (
              <KpiSummaryCard
                title={kpiSummaryCardTitle("목표 1", kpiItem)}
                item={kpiItem}
                effectiveIndicatorType={effectiveIndicatorTypePrimary}
                displayedFinalTargetValue={displayedFinalTargetValuePrimary}
                kioskMode={kioskMode}
              />
            )}
          </div>

          <div
            className={`kpi-modal-composed-chart relative flex flex-col rounded-xl border border-sky-200 bg-white [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none ${
              kioskMode
                ? `mb-4 shrink-0 p-2${
                    kioskMonthDetailOpen ? " min-h-[280px] flex-1" : ""
                  }`
                : "h-[320px] p-1 sm:h-[360px]"
            }`}
            style={
              kioskMode && !kioskMonthDetailOpen
                ? { height: kioskChartHeightPx }
                : undefined
            }
          >
            {chartViewOptions.length > 0 ? (
              <div className="mb-1 flex items-center justify-end gap-3 px-1">
                {chartViewOptions.map(({ mode, label }) => (
                  <label
                    key={mode}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={chartViewMode === mode}
                      onChange={() => {
                        setChartViewMode(mode);
                        setHoveredCompositeSeries(null);
                        setFocusedBubbleMonth(null);
                        setFocusedBubbleKind(null);
                        setBubbleDisplayMode("none");
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="relative min-h-0 flex-1">
              {chartShowsDualGroupedBars ? (
                <>
                  <span className="pointer-events-none absolute bottom-0 left-5 z-10 rounded border border-sky-200 bg-sky-50/95 px-2 py-0.5 text-[11px] font-bold text-sky-700 shadow-sm">
                    {chartAxisTitle(effectiveIndicatorTypePrimary)}
                  </span>
                  <span className="pointer-events-none absolute bottom-0 right-5 z-10 rounded border border-red-200 bg-white/95 px-2 py-0.5 text-[11px] font-bold text-orange-700 shadow-sm">
                    {chartAxisTitle(effectiveIndicatorTypeSecondary)}
                  </span>
                </>
              ) : null}
              <ResponsiveContainer width="100%" height="100%" key={`kpi-chart-${chartViewMode}`}>
                <ComposedChart
                data={chartData}
                accessibilityLayer={false}
                style={{ outline: "none" }}
                barCategoryGap={kioskChartBarCategoryGap}
                margin={{
                  top: 22,
                  right: chartShowsDualGroupedBars ? 26 : kioskMode ? 18 : 8,
                  left: chartShowsDualGroupedBars ? 14 : kioskMode ? 18 : -4,
                  bottom: 6,
                }}
                {...(chartShowsDualGroupedBars
                  ? {
                      barSize: kioskMode ? 30 : COMPOSITE_BAR_SIZE_PX,
                      barGap: kioskMode ? 4 : COMPOSITE_BAR_GAP_PX,
                    }
                  : {})}
                onClick={(state) => {
                  if (barClickHandledRef.current) {
                    barClickHandledRef.current = false;
                    return;
                  }
                  // 실적 막대 외 영역 클릭 시: 선택 말풍선 해제
                  setFocusedBubbleMonth(null);
                  setFocusedBubbleKind(null);
                  setBubbleDisplayMode("none");
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis
                  dataKey="periodLabel"
                  axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                  tickLine={{ stroke: "#94a3b8" }}
                  tickMargin={8}
                  tick={{ fill: "#334155", fontSize: kioskChartAxisFontSize }}
                />
                <YAxis
                  yAxisId="primary"
                  width={yAxisWidth}
                  domain={[chartYDomain.min, chartYDomain.max]}
                  allowDataOverflow
                  ticks={yAxisTicks}
                  tickFormatter={(v) => {
                    const numeric = typeof v === "number" ? v : Number(v);
                    if (!Number.isFinite(numeric)) return "";
                    return chartTickLabel(chartAxisIndicatorType, numeric, kioskMode);
                  }}
                  axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                  tickLine={{ stroke: "#94a3b8" }}
                  tickMargin={kioskMode ? 10 : 6}
                  tick={{ fill: "#64748b", fontSize: kioskChartAxisFontSize }}
                />
                {chartShowsDualGroupedBars ? (
                  <YAxis
                    yAxisId="secondary"
                    orientation="right"
                    width={yAxisWidthSecondary}
                    domain={[chartYDomainSecondary.min, chartYDomainSecondary.max]}
                    allowDataOverflow
                    ticks={yAxisTicksSecondary}
                    tickFormatter={(v) => {
                      const numeric = typeof v === "number" ? v : Number(v);
                      if (!Number.isFinite(numeric)) return "";
                      return chartTickLabel(
                        effectiveIndicatorTypeSecondary,
                        numeric,
                        kioskMode
                      );
                    }}
                    axisLine={{ stroke: CHART_COMPOSITE_GOAL2_TARGET_STROKE, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COMPOSITE_GOAL2_TARGET_STROKE }}
                    tickMargin={kioskMode ? 10 : 6}
                    tick={{ fill: "#9a3412", fontSize: kioskChartAxisFontSize }}
                  />
                ) : null}
                <Tooltip
                  cursor={false}
                  content={
                    <KpiChartTooltip
                      indicatorType={chartAxisIndicatorType}
                      hoveredCompositeSeries={hoveredCompositeSeries}
                      disabled={bubbleDisplayMode === "bar"}
                    />
                  }
                />
                <ReferenceLine yAxisId="primary" y={0} stroke="#dbeafe" strokeDasharray="3 3" strokeWidth={1} />
                {chartShowsDualGroupedBars ? (
                  <>
                    <Line
                      yAxisId="primary"
                      type="linear"
                      dataKey="target"
                      name="목표 1"
                      stroke={CHART_COMPOSITE_GOAL1_TARGET_STROKE}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      connectNulls
                      shape={CompositeTargetLineShapeFactory(COMPOSITE_GOAL1_X_SHIFT)}
                      isAnimationActive={false}
                      dot={createTargetLineDotRenderer({
                        onTargetClick: focusBubblesByTargetClick,
                        goalKind: "primary",
                        stroke: CHART_COMPOSITE_GOAL1_TARGET_STROKE,
                        shiftX: COMPOSITE_GOAL1_X_SHIFT,
                      })}
                      activeDot={false}
                      style={{ outline: "none" }}
                    >
                      {hasTargetNoteLabels ? (
                        <LabelList
                          dataKey="targetNoteLabel"
                          content={FocusedTargetBubbleLabelFactory(
                            KpiTargetBubbleLabelGoal1,
                            focusedBubbleMonth,
                            focusedBubbleKind,
                            bubbleDisplayMode,
                            "primary",
                            "targetNoteLabel",
                            chartData,
                            COMPOSITE_GOAL1_X_SHIFT
                          )}
                        />
                      ) : null}
                    </Line>
                    <Line
                      yAxisId="secondary"
                      type="linear"
                      dataKey="targetSecondary"
                      name="목표 2"
                      stroke={CHART_COMPOSITE_GOAL2_TARGET_STROKE}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      connectNulls
                      shape={CompositeTargetLineShapeFactory(COMPOSITE_GOAL2_X_SHIFT)}
                      isAnimationActive={false}
                      dot={createTargetLineDotRenderer({
                        onTargetClick: focusBubblesByTargetClick,
                        goalKind: "secondary",
                        stroke: CHART_COMPOSITE_GOAL2_TARGET_STROKE,
                        shiftX: COMPOSITE_GOAL2_X_SHIFT,
                      })}
                      activeDot={false}
                      style={{ outline: "none" }}
                    >
                      {hasTargetNoteLabelsSecondary ? (
                        <LabelList
                          dataKey="targetNoteSecondaryLabel"
                          content={FocusedTargetBubbleLabelFactory(
                            KpiTargetBubbleLabelGoal2,
                            focusedBubbleMonth,
                            focusedBubbleKind,
                            bubbleDisplayMode,
                            "secondary",
                            "targetNoteSecondaryLabel",
                            chartData,
                            COMPOSITE_GOAL2_X_SHIFT
                          )}
                        />
                      ) : null}
                    </Line>
                    <Bar
                      yAxisId="primary"
                      dataKey="barPrimary"
                      name="실적 1"
                      fill="#0284c7"
                      stroke="#0284c7"
                      strokeWidth={2}
                      activeBar={false}
                      maxBarSize={26}
                      radius={[2, 2, 0, 0]}
                      shape={(props: unknown) => (
                        <CompositeActualPerformanceBarShape
                          {...(props as {
                            x?: number;
                            y?: number;
                            width?: number;
                            height?: number;
                            fill?: string;
                            payload?: ChartDatum;
                          })}
                          kind="primary"
                          focusedMonth={focusedBubbleMonth}
                          focusedKind={focusedBubbleKind}
                          displayMode={bubbleDisplayMode}
                          draftValue={focusedDraftCommentPrimary}
                          commentsByMonth={rowByMonthPrimary}
                          monthList={displayMonthList}
                          showBubble={false}
                        />
                      )}
                      style={{ outline: "none" }}
                      isAnimationActive={false}
                      onClick={(data: unknown) => handlePerformanceBarClick(data, "primary")}
                      onMouseEnter={() => setHoveredCompositeSeries("primary")}
                      onMouseLeave={() => setHoveredCompositeSeries(null)}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={`bp-${entry.periodLabel}`}
                          fill="#0284c7"
                          className="cursor-pointer outline-none focus:outline-none"
                          style={{ outline: "none" }}
                          onClick={() => {
                            if (entry.month === 0) return;
                            barClickHandledRef.current = true;
                            focusBubblesByBarClick(entry.month, "primary");
                          }}
                        />
                      ))}
                    </Bar>
                    <Bar
                      yAxisId="secondary"
                      dataKey="barSecondary"
                      name="실적 2"
                      fill="#ea580c"
                      stroke="#ea580c"
                      strokeWidth={2}
                      activeBar={false}
                      maxBarSize={26}
                      radius={[2, 2, 0, 0]}
                      shape={(props: unknown) => (
                        <CompositeActualPerformanceBarShape
                          {...(props as {
                            x?: number;
                            y?: number;
                            width?: number;
                            height?: number;
                            fill?: string;
                            payload?: ChartDatum;
                          })}
                          kind="secondary"
                          focusedMonth={focusedBubbleMonth}
                          focusedKind={focusedBubbleKind}
                          displayMode={bubbleDisplayMode}
                          draftValue={focusedDraftCommentSecondary}
                          commentsByMonth={rowByMonthSecondary}
                          monthList={displayMonthList}
                          showBubble={false}
                        />
                      )}
                      style={{ outline: "none" }}
                      isAnimationActive={false}
                      onClick={(data: unknown) => handlePerformanceBarClick(data, "secondary")}
                      onMouseEnter={() => setHoveredCompositeSeries("secondary")}
                      onMouseLeave={() => setHoveredCompositeSeries(null)}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={`bs-${entry.periodLabel}`}
                          fill="#ea580c"
                          className="cursor-pointer outline-none focus:outline-none"
                          style={{ outline: "none" }}
                          onClick={() => {
                            if (entry.month === 0) return;
                            barClickHandledRef.current = true;
                            focusBubblesByBarClick(entry.month, "secondary");
                          }}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="primary"
                      type="linear"
                      dataKey="barPrimary"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                    >
                      <LabelList
                        dataKey="periodLabel"
                        content={FocusedCommentBubbleLabelFactory({
                          focusedMonth: focusedBubbleMonth,
                          focusedKind: focusedBubbleKind,
                          displayMode: bubbleDisplayMode,
                          kind: "primary",
                          chartData,
                          draftValue: focusedDraftCommentPrimary,
                          commentsByMonth: rowByMonthPrimary,
                          monthList: displayMonthList,
                          shiftX: COMPOSITE_GOAL1_X_SHIFT,
                        })}
                      />
                    </Line>
                    <Line
                      yAxisId="secondary"
                      type="linear"
                      dataKey="barSecondary"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                    >
                      <LabelList
                        dataKey="periodLabel"
                        content={FocusedCommentBubbleLabelFactory({
                          focusedMonth: focusedBubbleMonth,
                          focusedKind: focusedBubbleKind,
                          displayMode: bubbleDisplayMode,
                          kind: "secondary",
                          chartData,
                          draftValue: focusedDraftCommentSecondary,
                          commentsByMonth: rowByMonthSecondary,
                          monthList: displayMonthList,
                          shiftX: COMPOSITE_GOAL2_X_SHIFT,
                        })}
                      />
                    </Line>
                    <Line
                      yAxisId="primary"
                      type="linear"
                      dataKey="target"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                    >
                      {hasTargetNoteLabels ? (
                        <LabelList
                          dataKey="targetNoteLabel"
                          content={FocusedTargetBubbleLabelFactory(
                            KpiTargetBubbleLabelGoal1,
                            focusedBubbleMonth,
                            focusedBubbleKind,
                            bubbleDisplayMode,
                            "primary",
                            "targetNoteLabel",
                            chartData,
                            COMPOSITE_GOAL1_X_SHIFT
                          )}
                        />
                      ) : null}
                    </Line>
                    <Line
                      yAxisId="secondary"
                      type="linear"
                      dataKey="targetSecondary"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                    >
                      {hasTargetNoteLabelsSecondary ? (
                        <LabelList
                          dataKey="targetNoteSecondaryLabel"
                          content={FocusedTargetBubbleLabelFactory(
                            KpiTargetBubbleLabelGoal2,
                            focusedBubbleMonth,
                            focusedBubbleKind,
                            bubbleDisplayMode,
                            "secondary",
                            "targetNoteSecondaryLabel",
                            chartData,
                            COMPOSITE_GOAL2_X_SHIFT
                          )}
                        />
                      ) : null}
                    </Line>
                  </>
                ) : (
                  <>
                    <Bar
                      yAxisId="primary"
                      dataKey="actual"
                      name="실적"
                      fill={CHART_BAR_LEGEND_FILL}
                      activeBar={false}
                      maxBarSize={kioskChartBarMaxSize}
                      shape={ActualBarShape}
                      style={{ outline: "none" }}
                      onClick={(data: unknown) => handlePerformanceBarClick(data, "primary")}
                    >
                      {chartData.map((entry) => {
                        const isSel = entry.month === selectedMonth;
                        return (
                          <Cell
                            key={entry.periodLabel}
                            fill={
                              entry.isBenchmark
                                ? CHART_BENCHMARK_BAR_FILL
                                : performanceAchievementBarColor(
                                    entry.submittedPercent,
                                    isSel
                                  )
                            }
                            className="cursor-pointer outline-none focus:outline-none"
                            style={{ outline: "none" }}
                            onClick={() => {
                              if (entry.month === 0) return;
                              barClickHandledRef.current = true;
                              focusBubblesByBarClick(entry.month, "primary");
                            }}
                          />
                        );
                      })}
                    </Bar>
                    <Line
                      yAxisId="primary"
                      type="linear"
                      dataKey="actual"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls
                      legendType="none"
                      tooltipType="none"
                    >
                      <LabelList
                        dataKey="periodLabel"
                        content={FocusedCommentBubbleLabelFactory({
                          focusedMonth: focusedBubbleMonth,
                          focusedKind: focusedBubbleKind,
                          displayMode: bubbleDisplayMode,
                          kind: "primary",
                          chartData,
                          draftValue: focusedDraftCommentPrimary,
                          commentsByMonth: rowByMonth,
                          monthList: displayMonthList,
                        })}
                      />
                    </Line>
                    <Line
                      yAxisId="primary"
                      type="linear"
                      dataKey="target"
                      name="목표"
                      stroke={CHART_TARGET_LINE_STROKE}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      connectNulls
                      isAnimationActive={false}
                      dot={createTargetLineDotRenderer({
                        onTargetClick: focusBubblesByTargetClick,
                        goalKind: "primary",
                        stroke: CHART_TARGET_LINE_STROKE,
                      })}
                      activeDot={false}
                      style={{ outline: "none" }}
                    >
                      {hasTargetNoteLabels ? (
                        <LabelList
                          dataKey="targetNoteLabel"
                          content={FocusedTargetBubbleLabelFactory(
                            KpiTargetBubbleLabel,
                            focusedBubbleMonth,
                            focusedBubbleKind,
                            bubbleDisplayMode,
                            "primary",
                            "targetNoteLabel",
                            chartData
                          )}
                        />
                      ) : null}
                    </Line>
                  </>
                )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <KpiChartFullLegend
              dualComposite={chartShowsDualGroupedBars}
              kioskMode={kioskMode}
            />
            {headerHoldDropStatus ? (
              <div
                className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl px-6 text-center backdrop-blur-[1px] ${
                  headerHoldDropStatus === "drop"
                    ? "bg-rose-950/45"
                    : "bg-amber-950/40"
                }`}
                role="status"
                aria-label={
                  headerHoldDropStatus === "drop"
                    ? `DROP: ${headerHoldDropReason ?? ""}`
                    : `HOLD: ${headerHoldDropReason ?? ""}`
                }
              >
                <p
                  className={`font-black tracking-[0.12em] ${
                    kioskMode
                      ? "text-7xl sm:text-8xl lg:text-9xl"
                      : "text-4xl sm:text-5xl"
                  } ${
                    headerHoldDropStatus === "drop"
                      ? "text-rose-50"
                      : "text-amber-50"
                  }`}
                >
                  {headerHoldDropStatus === "drop" ? "DROP" : "HOLD"}
                </p>
                {headerHoldDropReason ? (
                  <p
                    className={`mt-4 max-w-3xl font-bold leading-snug [text-shadow:0_2px_8px_rgba(0,0,0,0.55)] ${
                      kioskMode
                        ? "text-2xl sm:text-3xl lg:text-4xl"
                        : "text-base sm:text-lg"
                    } ${
                      headerHoldDropStatus === "drop"
                        ? "text-rose-200"
                        : "text-yellow-200"
                    }`}
                  >
                    {headerHoldDropReason}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            ref={kioskMode ? kioskMonthDetailRef : undefined}
            className={
              kioskMode
                ? "shrink-0 overflow-hidden rounded-xl border border-sky-200 bg-white"
                : undefined
            }
          >
            {kioskMode ? (
              <button
                type="button"
                onClick={() => setKioskMonthDetailOpen((open) => !open)}
                aria-expanded={kioskMonthDetailOpen}
                className="flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-sky-50/80"
              >
                <span className="text-base font-semibold text-slate-800">월별 상세</span>
                <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  {kioskMonthDetailOpen ? "접기" : "펼치기"}
                  <ChevronDown
                    className={`h-5 w-5 text-slate-500 transition-transform duration-200 ${
                      kioskMonthDetailOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </span>
              </button>
            ) : null}
            {!kioskMode || kioskMonthDetailOpen ? (
              <div className={kioskMode ? "border-t border-sky-100 px-4 pb-4 pt-3" : undefined}>
          <div
            className={
              kioskMode
                ? "mt-4 rounded-xl border border-sky-100 bg-slate-50/40 p-4"
                : "mt-4 rounded-xl border border-sky-200 bg-white p-4"
            }
          >
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              {formatAxisLabel(selectedMonth)} 상세
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {dualChartAndSummaryEligible &&
              chartViewMode === "composite" &&
              linkedSecondaryItem ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">실적 지표값</p>
                  <p className="mt-0.5 grid grid-cols-2 items-baseline gap-x-2 text-base font-bold tabular-nums text-slate-900">
                    <span className="min-w-0 whitespace-nowrap">
                      목표 1 :{" "}
                      {(() => {
                        const v = selectedChartDatum?.barPrimary;
                        return v !== null &&
                          v !== undefined &&
                          Number.isFinite(Number(v))
                          ? chartValueLabel(effectiveIndicatorTypePrimary, Number(v))
                          : "—";
                      })()}
                    </span>
                    <span className="min-w-0 whitespace-nowrap text-right">
                      목표 2 :{" "}
                      {(() => {
                        const v = selectedChartDatum?.barSecondary;
                        return v !== null &&
                          v !== undefined &&
                          Number.isFinite(Number(v))
                          ? chartValueLabel(effectiveIndicatorTypeSecondary, Number(v))
                          : "—";
                      })()}
                    </span>
                  </p>
                </div>
              ) : indicatorUsesComputedAchievement(effectiveIndicatorType) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    실적 지표값
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
              ) : effectiveIndicatorType === "normal" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    실적 지표값
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {selectedRow?.actual_value !== null &&
                    selectedRow?.actual_value !== undefined &&
                    Number.isFinite(Number(selectedRow.actual_value))
                      ? chartValueLabel("normal", Number(selectedRow.actual_value))
                      : "—"}
                  </p>
                </div>
              ) : null}
              {dualChartAndSummaryEligible &&
              chartViewMode === "composite" &&
              selectedChartDatum ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">계산 달성률</p>
                  <p className="mt-0.5 grid grid-cols-2 items-baseline gap-x-2 text-base font-bold tabular-nums text-sky-800">
                    <span className="min-w-0 whitespace-nowrap">
                      목표 1 :{" "}
                      {selectedChartDatum.compositeAchievementGoal1Percent !== null &&
                      selectedChartDatum.compositeAchievementGoal1Percent !== undefined &&
                      Number.isFinite(selectedChartDatum.compositeAchievementGoal1Percent)
                        ? formatKoPercentMax2(selectedChartDatum.compositeAchievementGoal1Percent)
                        : "—"}
                    </span>
                    <span className="min-w-0 whitespace-nowrap text-right">
                      목표 2 :{" "}
                      {selectedChartDatum.submittedPercentSecondary !== null &&
                      selectedChartDatum.submittedPercentSecondary !== undefined &&
                      Number.isFinite(selectedChartDatum.submittedPercentSecondary)
                        ? formatKoPercentMax2(selectedChartDatum.submittedPercentSecondary)
                        : "—"}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">계산 달성률</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-sky-800">
                    {selectedSubmittedPercent !== null
                      ? formatKoPercentMax2(selectedSubmittedPercent)
                      : "—"}
                  </p>
                </div>
              )}
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
              <p className="text-[11px] font-semibold text-slate-500">진행 내용</p>
              <p className="mt-0.5 text-sm text-slate-800">
                {selectedDescription?.trim() ? selectedDescription : "등록된 진행 내용이 없습니다."}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">첨부 파일</p>
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
                        onClick={() =>
                          void handleDownloadEvidence(item.storedValue, item.fileName)
                        }
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
                <p className="mt-1 text-sm text-slate-500">첨부 파일이 없습니다</p>
              )}
            </div>

            {workflowPrimaryVisible || workflowFinalVisible ? (
              !kioskMode ? (
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
              ) : null
            ) : null}
          </div>
              </div>
            ) : null}
          </div>
          </div>

          {!kioskMode ? (
          <aside
            className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-sky-200 bg-white lg:w-[26rem] lg:max-w-[26rem] lg:flex-shrink-0 lg:border-l lg:border-t-0"
            aria-label="실적 입력"
          >
            {canEditPerformance ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {linkedSecondaryItem ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-600">입력할 목표</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPerfEditTarget("primary")}
                      className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        perfEditTarget === "primary"
                          ? "bg-sky-600 text-white shadow-sm"
                          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      목표1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerfEditTarget("secondary")}
                      className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        perfEditTarget === "secondary"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      목표2
                    </button>
                  </div>
                </div>
              ) : null}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <label className="block text-xs font-medium text-slate-600">
                      월 선택
                    </label>
                    {canAddDelayMonth ? (
                      <FieldInfoTip ariaLabel="월 선택 안내">
                        <span>
                          일정이 지연되면 권한자가 다음 평가 월을 한 달씩 추가할 수 있습니다.
                        </span>
                      </FieldInfoTip>
                    ) : null}
                  </div>
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
                {activeMonthListEditor.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    선택한 목표의 평가 기간에 해당하는 월이 없습니다.
                  </p>
                ) : (
                  <select
                    value={editorMonth}
                    onChange={(e) => {
                      const mo = Number(e.target.value) as MonthKey;
                      setEditorMonth(mo);
                      setSelectedMonth(mo);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    {activeMonthListEditor.map((mo) => (
                      <option key={mo} value={mo}>
                        {formatAxisLabel(mo)}
                      </option>
                    ))}
                  </select>
                )}
                {editorMonthLocked ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    승인 대기 중이거나 승인 완료된 월은 그룹장·팀장·관리자만 수정할 수 있습니다.
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="block text-xs font-medium text-slate-600">
                    계산 기준
                  </label>
                  <FieldInfoTip ariaLabel="계산 기준 안내">
                    <span>
                      KPI 항목에 저장된 계산 기준이 기본입니다. 누적은 이전 월 실적을 합산한 뒤 이번
                      월 달성률을 계산합니다.
                    </span>
                  </FieldInfoTip>
                </div>
                <select
                  value={editorAggregationType}
                  onChange={(e) =>
                    setEditorAggregationType(e.target.value as KpiAggregationType)
                  }
                  disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                >
                  <option value="monthly">당월 단독</option>
                  <option value="cumulative">누적 계산</option>
                </select>
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
                      !activeSetEditor.has(editorMonth) || editorMonthLocked
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder="0–100"
                  />
                </div>
              ) : null}

              {!isComputedItem && normalMetricEntryActive ? (
                <div>
                  <div className="mb-1 flex items-center gap-1">
                    <label className="block text-xs font-medium text-slate-600">
                      실적 지표값 (목표와 동일 단위)
                    </label>
                    <FieldInfoTip ariaLabel="실적 지표값 안내">
                      <span>
                        목표 대비 달성률을 자동 계산합니다.{" "}
                        {aggregationTypeLabelKo(editorAggregationType)} 기준 목표 지표:{" "}
                        {normalMonthlyTargetEditor !== null && normalMonthlyTargetEditor >= 0
                          ? chartValueLabel("normal", normalMonthlyTargetEditor)
                          : "—"}
                        . 계산 달성률:{" "}
                        {computedEditorPreviewPercent !== null
                          ? formatKoPercentMax2(computedEditorPreviewPercent)
                          : "지표값 입력 시 표시 (목표 대비 비율, 상한 100%)"}
                      </span>
                    </FieldInfoTip>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editorRate}
                    onChange={(e) => setEditorRate(e.target.value)}
                    disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder={
                      item.targetDirection === "down"
                        ? "예: 불량율 등 (낮을수록 좋음 지표값)"
                        : "예: 달성 지표값 (높을수록 좋음)"
                    }
                  />
                </div>
              ) : null}

              {isComputedItem ? (
                <div>
                  <div className="mb-1 flex items-center gap-1">
                    <label className="block text-xs font-medium text-slate-600">
                      {computedActualLabel(effectiveIndicatorType)}
                    </label>
                    <FieldInfoTip ariaLabel="실적 입력 안내">
                      <span>
                        {computedKindSummaryKo(effectiveIndicatorType)}는 원값으로부터 달성률을 자동
                        계산합니다. {aggregationTypeLabelKo(editorAggregationType)} 기준{" "}
                        {computedTargetLabel(effectiveIndicatorType)}:{" "}
                        {computedMonthlyTargetEditor !== null && computedMonthlyTargetEditor >= 0
                          ? chartValueLabel(effectiveIndicatorType, computedMonthlyTargetEditor)
                          : "미설정"}
                        . 계산 달성률:{" "}
                        {computedEditorPreviewPercent !== null
                          ? formatKoPercentMax2(computedEditorPreviewPercent)
                          : `${computedActualLabel(effectiveIndicatorType)} 입력 시 표시 (${computedFormulaHint(effectiveIndicatorType)})`}
                      </span>
                    </FieldInfoTip>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editorActualPpm}
                    onChange={(e) => setEditorActualPpm(e.target.value)}
                    disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                    placeholder={
                      effectiveIndicatorType === "quantity"
                        ? "k(천) 단위 숫자"
                        : effectiveIndicatorType === "time"
                          ? "시간(h) 단위 숫자"
                          : effectiveIndicatorType === "minutes"
                            ? "분(min) 단위 숫자"
                            : effectiveIndicatorType === "uph"
                              ? "UPH 숫자"
                              : effectiveIndicatorType === "cpk"
                                ? "Cpk 값(무차원)"
                                : isMoneyIndicatorType(effectiveIndicatorType)
                                  ? `${moneyIndicatorUnitSuffix(effectiveIndicatorType)} 단위 숫자`
                                  : "0 이상"
                    }
                  />
                </div>
              ) : null}

              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="block text-xs font-medium text-slate-600">
                    세부내용 / 코멘트
                  </label>
                  <FieldInfoTip ariaLabel="세부내용 안내">
                    <span>입력한 내용은 상세 영역의 코멘트로 표시됩니다.</span>
                  </FieldInfoTip>
                </div>
                <textarea
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value.replace(/\\/g, "₩"))}
                  disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="해당 실적에 대한 세부내용을 입력해 주세요."
                />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="block text-xs font-medium text-slate-600">
                    그래프 말풍선
                  </label>
                  <FieldInfoTip ariaLabel="그래프 말풍선 안내">
                    <span>저장 후 해당 월 막대 위에 짧은 말풍선으로 표시됩니다.</span>
                  </FieldInfoTip>
                </div>
                <input
                  type="text"
                  value={editorBubbleNote}
                  onChange={(e) => setEditorBubbleNote(e.target.value)}
                  disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
                  maxLength={40}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="예: 고객 요청 지연"
                />
              </div>

              <div>
                <div className="mb-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  <label className="text-xs font-medium text-slate-600">
                    이 월 전용 보고서 파일{" "}
                    {isAdmin ? (
                      <span className="text-slate-500">(관리자: 선택)</span>
                    ) : (
                      <span className="text-red-600">(필수)</span>
                    )}
                  </label>
                  <FieldInfoTip ariaLabel="증빙 파일 안내">
                    <span>
                      {isAdmin
                        ? "관리자는 파일 없이 저장할 수 있습니다. 파일을 넣으면 해당 월 증빙으로 저장됩니다."
                        : "최초 등록 시 증빙이 필요합니다. 이미 증빙이 있는 월은 달성률·코멘트만 바꿀 수 있고, 파일을 다시 고르면 목록이 통째로 교체됩니다."}
                    </span>
                  </FieldInfoTip>
                </div>
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
                    disabled={!activeSetEditor.has(editorMonth) || editorMonthLocked}
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
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-sky-200 bg-white px-4 py-3">
              {(canHoldDrop &&
                !headerItem.isFinalCompleted &&
                !headerHoldDropStatus) ||
              (canHoldDrop && headerHoldDropStatus) ||
              (canFinalComplete && headerItem.isFinalCompleted) ||
              (canFinalComplete &&
                !headerItem.isFinalCompleted &&
                !headerHoldDropStatus) ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canHoldDrop &&
                  !headerItem.isFinalCompleted &&
                  !headerHoldDropStatus ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openHoldDropModal("drop")}
                        disabled={holdDropSubmitting}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Drop
                      </button>
                      <button
                        type="button"
                        onClick={() => openHoldDropModal("hold")}
                        disabled={holdDropSubmitting}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Hold
                      </button>
                    </>
                  ) : null}
                  {canHoldDrop && headerHoldDropStatus ? (
                    <button
                      type="button"
                      onClick={() => openHoldDropModal("withdraw")}
                      disabled={holdDropSubmitting}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {headerHoldDropStatus === "drop" ? "Drop 철회" : "Hold 철회"}
                    </button>
                  ) : null}
                  {canFinalComplete && headerItem.isFinalCompleted ? (
                    <button
                      type="button"
                      onClick={() => void handleWithdrawFinalCompletionInModal()}
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      최종 철회
                    </button>
                  ) : null}
                  {canFinalComplete &&
                  !headerItem.isFinalCompleted &&
                  !headerHoldDropStatus ? (
                    <button
                      type="button"
                      onClick={() => void handleKpiFinalizeClick()}
                      disabled={
                        saveMutation.isPending ||
                        uploading ||
                        !activeSetEditor.has(editorMonth) ||
                        editorMonthLocked ||
                        !editorHasEvidenceForSave ||
                        (isComputedItem &&
                          parseNonNegativeDecimal(editorActualPpm) === null) ||
                        (normalMetricEntryActive &&
                          parseNonNegativeDecimal(
                            normalMonthlyActualInputForSave(
                              isComputedItem,
                              editorRate,
                              editorActualPpm
                            )
                          ) === null) ||
                        (!isComputedItem &&
                          !normalMetricEntryActive &&
                          !editorRate.trim())
                      }
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {saveMutation.isPending || uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      KPI 완료
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canWithdrawPendingSubmission ? (
                  <button
                    type="button"
                    onClick={() => void handleModalWithdrawSubmission()}
                    disabled={
                      withdrawMut.isPending ||
                      workflowMut.isPending ||
                      saveMutation.isPending ||
                      uploading
                    }
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {withdrawMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    제출 회수
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleModalDeletePerformance()}
                  disabled={
                    !editorMonthHasExistingSavedInput ||
                    deleteDraftMut.isPending ||
                    saveMutation.isPending ||
                    uploading
                  }
                  title={
                    editorMonthHasExistingSavedInput
                      ? `${editorMonth}월 실적 삭제`
                      : "선택한 월에 등록된 실적이 없습니다"
                  }
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteDraftMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  실적 삭제
                </button>
              <button
                type="button"
                onClick={() => void handleSaveMonth()}
                disabled={
                  saveMutation.isPending ||
                  uploading ||
                  !activeSetEditor.has(editorMonth) ||
                  editorMonthLocked ||
                  !editorHasEvidenceForSave ||
                  (isComputedItem &&
                    parseNonNegativeDecimal(editorActualPpm) === null) ||
                  (normalMetricEntryActive &&
                    parseNonNegativeDecimal(
                      normalMonthlyActualInputForSave(
                        isComputedItem,
                        editorRate,
                        editorActualPpm
                      )
                    ) === null) ||
                  (!isComputedItem &&
                    !normalMetricEntryActive &&
                    !editorRate.trim())
                }
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saveMutation.isPending || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {editorMonthHasExistingSavedInput
                  ? editorMonthIsReregisterContext
                    ? "재등록"
                    : "수정"
                  : "저장"}
              </button>
            </div>
          </div>
          </div>
            ) : (
              <div className="flex min-h-[100px] flex-1 flex-col justify-center px-3 py-6 lg:min-h-0">
                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  실적 입력 권한이 없어 이 영역에서는 조회만 가능합니다.
                </p>
              </div>
            )}
          </aside>
          ) : null}

        </div>

        {actionConfirm.open ? (
          <div
            className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/35 p-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) resolveActionConfirm(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="action-confirm-title"
              className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-5 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/90"
              onClick={(e) => e.stopPropagation()}
            >
              <h4
                id="action-confirm-title"
                className="text-base font-semibold text-slate-900"
              >
                {actionConfirm.title}
              </h4>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {actionConfirm.message}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => resolveActionConfirm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  아니오
                </button>
                <button
                  type="button"
                  onClick={() => resolveActionConfirm(true)}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  예
                </button>
              </div>
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
              className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl"
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

        {holdDropModal.open && holdDropModal.mode !== "withdraw" ? (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setHoldDropModal({ open: false, mode: "hold" });
                setHoldDropReasonDraft("");
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="hold-drop-modal-title"
              className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4
                id="hold-drop-modal-title"
                className="text-base font-semibold text-slate-900"
              >
                {holdDropModal.mode === "drop" ? "DROP 처리" : "HOLD 처리"}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                사유는 그래프에 크게 표시되며, 상태가 유지되는 동안 이 KPI는
                달성률 집계에서 제외됩니다.
              </p>
              <textarea
                value={holdDropReasonDraft}
                onChange={(e) => setHoldDropReasonDraft(e.target.value)}
                rows={4}
                className={`mt-3 w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 caret-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 ${
                  holdDropModal.mode === "drop"
                    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-100"
                    : "border-amber-300 focus:border-amber-500 focus:ring-amber-100"
                }`}
                placeholder={
                  holdDropModal.mode === "drop"
                    ? "DROP 사유를 입력해 주세요."
                    : "HOLD 사유를 입력해 주세요."
                }
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHoldDropModal({ open: false, mode: "hold" });
                    setHoldDropReasonDraft("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={holdDropSubmitting}
                  onClick={() => void submitHoldDropModal()}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                    holdDropModal.mode === "drop"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {holdDropSubmitting ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : holdDropModal.mode === "drop" ? (
                    "DROP 적용"
                  ) : (
                    "HOLD 적용"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ApprovalLineSelectModal
          open={approvalLineModalOpen}
          actorRole={profileRole}
          kpiItemId={
            (perfEditTarget === "secondary" && linkedSecondaryItem
              ? linkedSecondaryItem.id
              : headerItem.id) || ""
          }
          onCancel={() => {
            setApprovalLineModalOpen(false);
            setPendingSavePayload(null);
          }}
          onConfirm={(line) => {
            void executeSaveWithApprovalLine(line);
          }}
        />
      </div>
    </>
  );

  if (kioskMode) return shell;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {shell}
    </div>
  );
}
