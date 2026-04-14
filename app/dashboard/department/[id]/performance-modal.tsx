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
  indicatorUsesComputedAchievement,
  type ItemPerformanceRow,
  type KpiIndicatorType,
  updatePerformanceMonthlyEvidenceUrl,
  uploadEvidenceFile,
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
  roundToMax2DecimalPlaces,
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
  scheduleRaw: string | null;
  indicatorType: KpiIndicatorType;
  /** ppm·quantity·count 공통 목표 (`kpi_items.target_value`) */
  targetPpm: number | null;
};

function computedActualLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "실적 PPM";
  if (t === "quantity") return "실적 수량(k)";
  if (t === "count") return "실적 건수";
  return "실적";
}

function computedTargetLabel(t: KpiIndicatorType): string {
  if (t === "ppm") return "목표 PPM";
  if (t === "quantity") return "목표 수량(k)";
  if (t === "count") return "목표 건수";
  return "목표";
}

function computedFormulaHint(t: KpiIndicatorType): string {
  if (t === "ppm") return "Max(0, (2 − 실적/목표) × 100)";
  if (t === "quantity") {
    return "0~100%: 실적÷목표×100 (목표 이상이면 100%). 실적·목표 숫자는 k(천) 단위로 입력합니다.";
  }
  if (t === "count") {
    return "0~100%: 실적÷목표×100 (목표 이상이면 100%)";
  }
  return "";
}

function computedKindSummaryKo(t: KpiIndicatorType): string {
  if (t === "ppm") return "역지표(PPM)";
  if (t === "quantity") return "수량(k)";
  if (t === "count") return "건수";
  return "";
}
import {
  useKpiPerformances,
  useUpsertMonthPerformance,
  useWorkflowReviewMutation,
} from "@/src/hooks/useKpiQueries";

type ChartDatum = {
  periodLabel: string;
  month: MonthKey;
  target: number;
  actual: number;
  description: string | null;
  evidence_url: string | null;
  hasComment: boolean;
  /** 막대 높이는 달성률 유지, 상단에는 제출 지표 문자열만(있을 때만) */
  barTopLabel?: string;
};

/** 승인 반영 전이라도 해당 월에 실적 숫자가 저장돼 있으면 true (0%·0ppm 포함) */
function monthHasSubmittedPerformanceInput(
  indicatorType: KpiIndicatorType,
  row: ItemPerformanceRow | undefined,
  rawSubmittedPercent: number | null
): boolean {
  if (!row) return false;
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
  /** 관리자 전용 KPI 항목 삭제 */
  canDeleteKpiItem?: boolean;
  onDeleteKpiItem?: (kpiId: string) => Promise<void> | void;
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

function performanceStatusLabelKo(status: string | null | undefined): string {
  const s = status?.trim().toLowerCase() ?? "";
  if (s === "draft") return "제출 전";
  if (s === "pending_primary" || s === "pending") return "1차 승인 대기";
  if (s === PERF_STATUS_PENDING_FINAL) return "최종 승인 대기";
  if (s === PERF_STATUS_APPROVED) return "승인 완료";
  return status?.trim() ? status.trim() : "—";
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
      <p className="text-slate-600">목표 {chartValueLabel(indicatorType, d.target)}</p>
      <p className="text-sky-700">실적 {chartValueLabel(indicatorType, d.actual)}</p>
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

function chartValueLabel(indicatorType: KpiIndicatorType, value: number): string {
  if (indicatorType === "ppm") return `${formatKoMax2Decimals(value)} ppm`;
  if (indicatorType === "quantity") return `${formatKoMax2Decimals(value)} k`;
  if (indicatorType === "count") return `${formatKoMax2Decimals(value)} 건`;
  return formatKoPercentMax2(value);
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
  const [editorFile, setEditorFile] = useState<File | null>(null);
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

  const isComputedItem = kpiItem
    ? indicatorUsesComputedAchievement(kpiItem.indicatorType)
    : false;
  const targetPpm = kpiItem?.targetPpm ?? null;

  const computedEditorPreviewPercent = useMemo(() => {
    if (!isComputedItem || !kpiItem || targetPpm === null || !(targetPpm > 0)) {
      return null;
    }
    const ap = parseNonNegativeDecimal(editorActualPpm);
    if (ap === null) return null;
    return computedAchievementPercent(kpiItem.indicatorType, ap, targetPpm);
  }, [isComputedItem, kpiItem, targetPpm, editorActualPpm]);

  const isAdmin = isAdminRole(profileRole);
  const normalizedRole = normalizeRole(profileRole);
  const isPrivilegedEditor =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader";

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
    const start = activeMonthList[0]!;
    const periodEnd = activeMonthList[activeMonthList.length - 1]!;
    const endWithBuffer = Math.min(15, periodEnd + 3);
    const months: MonthKey[] = [];
    for (let m = start; m <= endWithBuffer; m += 1) {
      months.push(m as MonthKey);
    }
    return months;
  }, [kpiItem, activeMonthList]);

  const activeSet = useMemo(
    () => new Set<MonthKey>(displayMonthList),
    [displayMonthList]
  );

  const rowByMonth = useMemo(() => {
    const m = new Map<MonthKey, ItemPerformanceRow>();
    for (const r of liveRows) {
      const mk = halfTypeLabelToMonth(r.half_type);
      if (mk !== null && !m.has(mk)) m.set(mk, r);
    }
    return m;
  }, [liveRows]);

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
    const periodStart = activeMonthList[0] ?? 1;
    const periodEnd = activeMonthList[activeMonthList.length - 1] ?? 12;
    const h1vRaw = kpiItem.firstHalfTarget ?? kpiItem.firstHalfRate ?? null;
    const h2vRaw = kpiItem.secondHalfTarget ?? kpiItem.secondHalfRate ?? null;
    const h1v = h1vRaw ?? 0;
    const finalTarget =
      kpiItem.targetFinalValue !== null && kpiItem.targetFinalValue !== undefined
        ? kpiItem.targetFinalValue
        : h2vRaw ?? h1vRaw ?? kpiItem.challengeTarget ?? 0;
    const h1Month = Math.max(periodStart, Math.min(periodEnd, periodStart + 5));
    const h2Month = Math.max(h1Month + 1, Math.min(periodEnd - 1, periodEnd - 1));
    const hasH1Kink = h1vRaw !== null;
    const hasH2Kink = h2vRaw !== null;
    function segmentValue(
      month: number,
      fromMonth: number,
      toMonth: number,
      fromValue: number,
      toValue: number
    ): number {
      if (toMonth <= fromMonth) return toValue;
      const ratio = (month - fromMonth) / (toMonth - fromMonth);
      return fromValue + (toValue - fromValue) * Math.max(0, Math.min(1, ratio));
    }
    const series: ChartDatum[] = displayMonthList.map((m) => {
      const row = rowByMonth.get(m);
      const visibleOnChart = isChartVisibleStep(row?.approval_step ?? null);
      const rawSubmitted =
        row?.achievement_rate !== null &&
        row?.achievement_rate !== undefined &&
        !Number.isNaN(Number(row.achievement_rate))
          ? Number(row.achievement_rate)
          : null;
      const rawActualMetric =
        row?.actual_value !== null &&
        row?.actual_value !== undefined &&
        Number.isFinite(Number(row.actual_value))
          ? Number(row.actual_value)
          : null;
      const actual = indicatorUsesComputedAchievement(kpiItem.indicatorType)
        ? visibleOnChart && rawActualMetric !== null
          ? rawActualMetric
          : 0
        : visibleOnChart && rawSubmitted !== null
          ? rawSubmitted
          : 0;
      const description = row?.description ?? null;
      const target = indicatorUsesComputedAchievement(kpiItem.indicatorType)
        ? kpiItem.targetPpm ?? 0
        : (() => {
            if (
              kpiItem.periodStartMonth !== null &&
              kpiItem.periodEndMonth !== null &&
              Number.isInteger(kpiItem.periodStartMonth) &&
              Number.isInteger(kpiItem.periodEndMonth) &&
              kpiItem.periodStartMonth >= 1 &&
              kpiItem.periodEndMonth <= 15 &&
              kpiItem.periodStartMonth <= kpiItem.periodEndMonth
            ) {
              const start = kpiItem.periodStartMonth;
              const end = kpiItem.periodEndMonth;
              if (m > end) return roundToMax2DecimalPlaces(finalTarget);
              if (m === end) return roundToMax2DecimalPlaces(finalTarget);
              if (hasH1Kink && hasH2Kink && h2Month > h1Month) {
                if (m <= h1Month) {
                  if (h1Month <= start) return roundToMax2DecimalPlaces(h1vRaw ?? 0);
                  return roundToMax2DecimalPlaces(
                    segmentValue(m, start, h1Month, 0, h1vRaw ?? 0)
                  );
                }
                if (m <= h2Month) {
                  return roundToMax2DecimalPlaces(
                    segmentValue(m, h1Month, h2Month, h1vRaw ?? 0, h2vRaw ?? h1vRaw ?? 0)
                  );
                }
                return roundToMax2DecimalPlaces(
                  segmentValue(m, h2Month, end, h2vRaw ?? h1vRaw ?? 0, finalTarget)
                );
              }
              if (hasH1Kink) {
                if (m <= h1Month) {
                  if (h1Month <= start) return roundToMax2DecimalPlaces(h1vRaw ?? 0);
                  return roundToMax2DecimalPlaces(
                    segmentValue(m, start, h1Month, 0, h1vRaw ?? 0)
                  );
                }
                return roundToMax2DecimalPlaces(
                  segmentValue(m, h1Month, end, h1vRaw ?? 0, finalTarget)
                );
              }
              const span = Math.max(1, end - start + 1);
              const progress = (m - start + 1) / span;
              return roundToMax2DecimalPlaces(finalTarget * Math.max(0, Math.min(1, progress)));
            }
            if (m > periodEnd) {
              return roundToMax2DecimalPlaces(finalTarget);
            }
            const legacySpan = Math.max(1, periodEnd - periodStart + 1);
            const legacyProgress = (m - periodStart + 1) / legacySpan;
            return roundToMax2DecimalPlaces(
              finalTarget * Math.max(0, Math.min(1, legacyProgress))
            );
          })();
      const showBarTopLabel =
        visibleOnChart ||
        monthHasSubmittedPerformanceInput(
          kpiItem.indicatorType,
          row,
          rawSubmitted
        );
      const topLabel = chartBarTopLabel(
        kpiItem.indicatorType,
        row,
        showBarTopLabel,
        rawSubmitted
      );
      return {
        periodLabel: formatAxisLabel(m),
        month: m,
        target,
        actual,
        description,
        evidence_url: row?.evidence_url ?? null,
        hasComment: Boolean(description?.trim()),
        ...(topLabel ? { barTopLabel: topLabel } : {}),
      };
    });
    return series;
  }, [kpiItem, rowByMonth, activeMonthList, displayMonthList]);

  const chartYDomainMax = useMemo(() => {
    if (!kpiItem) return 100;
    let mx = 0;
    for (const d of chartData) {
      mx = Math.max(mx, d.actual, d.target);
    }
    if (!Number.isFinite(mx) || mx <= 0) return 100;
    const paddedMax = mx * 1.2;
    const unit = paddedMax <= 10 ? 1 : 10;
    if (!indicatorUsesComputedAchievement(kpiItem.indicatorType)) {
      return Math.max(100, Math.ceil(paddedMax / unit) * unit);
    }
    return Math.max(10, Math.ceil(paddedMax / unit) * unit);
  }, [kpiItem, chartData]);

  const selectedRow = rowByMonth.get(selectedMonth) ?? null;
  const selectedSubmittedPercent =
    selectedRow?.achievement_rate !== null &&
    selectedRow?.achievement_rate !== undefined
      ? selectedRow.achievement_rate
      : null;
  const chartActualSelected =
    chartData.find((d) => d.month === selectedMonth)?.actual ?? 0;
  const selectedDescription = selectedRow?.description ?? null;
  const selectedEvidenceStored =
    selectedRow?.evidence_path ??
    selectedRow?.evidence_url ??
    liveRows.find((r) => (r.evidence_path ?? r.evidence_url)?.trim())
      ?.evidence_path ??
    liveRows.find((r) => (r.evidence_path ?? r.evidence_url)?.trim())
      ?.evidence_url ??
    null;
  const selectedEvidencePath = evidencePathFromStoredValue(selectedEvidenceStored);
  const selectedEvidenceFileName = evidenceFileNameFromStoredValue(
    selectedEvidenceStored
  );
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

  async function handleDownloadEvidence() {
    if (!selectedEvidenceStored) {
      notify("info", "보고서가 없습니다.");
      return;
    }
    try {
      setDownloadingEvidence(true);
      const downloadableUrl = resolveEvidencePublicUrl(selectedEvidenceStored);
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
    (editorRow?.evidence_path?.trim() ?? "") ||
      (editorRow?.evidence_url?.trim() ?? "")
  );
  const editorHasEvidenceForSave = Boolean(editorFile) || editorHasStoredEvidence;

  const syncEditorFromMonth = useCallback(
    (mo: MonthKey) => {
      const row = findRowByMonth(liveRows, mo);
      setEditorRate(
        row?.achievement_rate !== null && row?.achievement_rate !== undefined
          ? String(row.achievement_rate)
          : ""
      );
      setEditorActualPpm(
        row?.actual_value !== null && row?.actual_value !== undefined
          ? String(row.actual_value)
          : ""
      );
      setEditorDescription(row?.description ?? "");
      setEditorFile(null);
    },
    [liveRows]
  );

  useEffect(() => {
    if (mode !== "editor") return;
    syncEditorFromMonth(editorMonth);
  }, [mode, editorMonth, liveRows, syncEditorFromMonth]);

  if (!isOpen || !kpiItem) return null;
  const item = kpiItem;

  async function handleSaveMonth() {
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
    const isComputed = indicatorUsesComputedAchievement(item.indicatorType);
    let rateNum: number;
    let actualMetricSave: number | undefined;
    if (isComputed) {
      if (item.targetPpm === null || !(item.targetPpm > 0)) {
        notify(
          "error",
          `${computedKindSummaryKo(item.indicatorType)} 항목에는 목표값(kpi_items.target_value)이 필요합니다. 부서 목록에서 그룹장·관리자가 설정해 주세요.`
        );
        return;
      }
      const ap = parseNonNegativeDecimal(editorActualPpm);
      if (ap === null) {
        notify("error", `${computedActualLabel(item.indicatorType)}을(를) 입력해 주세요.`);
        return;
      }
      actualMetricSave = ap;
      rateNum = computedAchievementPercent(
        item.indicatorType,
        ap,
        item.targetPpm
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
        indicatorMode: isComputed ? item.indicatorType : "normal",
        ...(isComputed && actualMetricSave !== undefined
          ? { actualValue: actualMetricSave }
          : {}),
        ...(isAdmin ? { adminBypassApprovalLock: true } : {}),
        actorRole: profileRole ?? null,
      });

      if (editorFile) {
        const targetId =
          saveResult && typeof saveResult.targetId === "string"
            ? saveResult.targetId
            : "";
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
        const uploaded = await uploadEvidenceFile(
          targetId,
          editorFile,
          `m${editorMonth}`
        );
        await updatePerformanceMonthlyEvidenceUrl({
          targetId,
          month: editorMonth,
          evidenceUrl: uploaded.fullPath,
        });
      }

      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      setEditorFile(null);
      const submittedFinal = normalizeRole(profileRole) === "group_leader";
      notify(
        "success",
        submittedFinal
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
                  수정
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">측정 기준</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{item.bm || "—"}</p>
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
                  {item.targetFinalValue !== null && item.targetFinalValue !== undefined
                    ? chartValueLabel(item.indicatorType, item.targetFinalValue)
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">자동계산 기준값</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {indicatorUsesComputedAchievement(item.indicatorType) &&
                  item.targetPpm !== null &&
                  item.targetPpm > 0
                    ? chartValueLabel(item.indicatorType, item.targetPpm)
                    : "해당 없음"}
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
                margin={{ top: 26, right: 16, left: 4, bottom: 4 }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (typeof label !== "string") return;
                  const hit = chartData.find((d) => d.periodLabel === label);
                  if (hit?.month !== null && hit?.month !== undefined) {
                    setSelectedMonth(hit.month);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="periodLabel" tick={{ fill: "#334155", fontSize: 11 }} />
                <YAxis
                  domain={[0, chartYDomainMax]}
                  tickFormatter={(v) =>
                    chartValueLabel(
                      kpiItem.indicatorType,
                      typeof v === "number" ? v : Number(v)
                    )
                  }
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<KpiChartTooltip indicatorType={kpiItem.indicatorType} />} />
                <Legend content={KpiComposedLegend} />
                <Bar
                  dataKey="actual"
                  name="실적"
                  fill={CHART_BAR_LEGEND_FILL}
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
                    if (!row) return;
                    setSelectedMonth(row.month);
                  }}
                >
                  {chartData.map((entry) => {
                    const isSel = entry.month === selectedMonth;
                    return (
                      <Cell
                        key={entry.periodLabel}
                        fill={
                          isSel ? "#0369a1" : "#0284c7"
                        }
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
                </Bar>
                <Line
                  type="linear"
                  dataKey="target"
                  name="목표"
                  stroke={CHART_TARGET_LINE_STROKE}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  dot={{ r: 3, fill: CHART_TARGET_LINE_STROKE, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CHART_TARGET_LINE_STROKE }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 px-1 text-[11px] leading-snug text-slate-500">
              목표는 <span className="font-medium text-red-600">점선</span>, 실적은{" "}
              <span className="font-medium text-sky-700">막대</span>로 표시됩니다. 실적 막대는 승인 반영값 기준입니다.
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
              {indicatorUsesComputedAchievement(item.indicatorType) ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    {computedActualLabel(item.indicatorType)}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    {selectedRow?.actual_value !== null &&
                    selectedRow?.actual_value !== undefined
                      ? chartValueLabel(item.indicatorType, Number(selectedRow.actual_value))
                      : "—"}
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
              {selectedEvidencePath ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="max-w-full truncate text-sm text-slate-800">
                    {selectedEvidenceFileName}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDownloadEvidence()}
                    disabled={downloadingEvidence}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    파일 다운로드
                  </button>
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
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  월 선택
                </label>
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
              </div>

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
                    indicatorUsesComputedAchievement(item.indicatorType) ||
                    !activeSet.has(editorMonth) ||
                    editorMonthLocked
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="0–100"
                />
                {indicatorUsesComputedAchievement(item.indicatorType) ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {computedKindSummaryKo(item.indicatorType)}는 달성률을 직접 쓰지 않고 아래{" "}
                    {computedActualLabel(item.indicatorType)}으로부터 계산합니다.
                  </p>
                ) : null}
              </div>

              {indicatorUsesComputedAchievement(item.indicatorType) ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {computedActualLabel(item.indicatorType)}
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
                      item.indicatorType === "quantity"
                        ? "k(천) 단위 숫자"
                        : "0 이상"
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {computedTargetLabel(item.indicatorType)}:{" "}
                    {item.targetPpm !== null && item.targetPpm > 0
                      ? formatKoMax2Decimals(item.targetPpm)
                      : "미설정"}
                    . 계산 달성률:{" "}
                    {computedEditorPreviewPercent !== null
                      ? formatKoPercentMax2(computedEditorPreviewPercent)
                      : `${computedActualLabel(item.indicatorType)} 입력 시 표시 (${computedFormulaHint(item.indicatorType)})`}
                  </p>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  특이사항 (remarks)
                </label>
                <textarea
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="해당 월 코멘트"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  이 월 전용 보고서 파일 <span className="text-red-600">(필수)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-slate-700 hover:bg-sky-50">
                  <Upload className="h-4 w-4 text-sky-600" />
                  <span>
                    {editorFile ? editorFile.name : "파일 선택(최대50MB)"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={!activeSet.has(editorMonth) || editorMonthLocked}
                    onChange={(e) => setEditorFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-500">
                  최초 등록 시 파일 첨부가 필요합니다. 이미 첨부된 증빙이 있는 월은 달성률·코멘트만
                  바꿀 수 있으며, 파일을 다시 선택하면 교체됩니다.
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
                  (indicatorUsesComputedAchievement(item.indicatorType) &&
                    parseNonNegativeDecimal(editorActualPpm) === null) ||
                  (!indicatorUsesComputedAchievement(item.indicatorType) &&
                    !editorRate.trim())
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {normalizeRole(profileRole) === "group_leader"
                  ? "저장 (최종 승인 대기로 제출)"
                  : "저장 (1차 승인 대기로 제출)"}
              </button>
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
