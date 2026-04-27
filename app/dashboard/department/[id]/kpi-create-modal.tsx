"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import type {
  CreateManualKpiInput,
  KpiAchievementCap,
  KpiAggregationType,
  KpiEvaluationType,
  KpiIndicatorType,
  KpiQualitativeCalcType,
  KpiTargetFillPolicy,
} from "@/src/lib/kpi-queries";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  deptId: string;
  deptName: string;
  currentWeightSum: number;
  mainTopicOptions: string[];
  subTopicOptions: string[];
  editingItem?: {
    id: string;
    mainTopic: string;
    subTopic: string;
    detailActivity: string;
    bm: string;
    owner: string;
    weight: string;
    evaluationType: KpiEvaluationType | null;
    unit: string | null;
    indicatorType: KpiIndicatorType;
    targetDirection: "up" | "down" | "na";
    qualitativeCalcType: KpiQualitativeCalcType | null;
    aggregationType: KpiAggregationType | null;
    targetFillPolicy: KpiTargetFillPolicy | null;
    achievementCap: KpiAchievementCap;
    periodStartMonth: number | null;
    periodEndMonth: number | null;
    targetPpm: number | null;
    monthlyTargets: Partial<Record<number, number>>;
    monthlyTargetNotes: Partial<Record<number, string>>;
  } | null;
  onSubmit: (payload: CreateManualKpiInput, options?: { kpiId?: string }) => Promise<void>;
  submitting: boolean;
};

type BaselineOption = "%" | "PPM" | "ea" | "건" | "명" | "k" | "억" | "시간" | "UPH";
type DirectionOption = "higher" | "lower";

const BASELINE_OPTIONS: BaselineOption[] = [
  "%",
  "PPM",
  "ea",
  "건",
  "명",
  "k",
  "억",
  "시간",
  "UPH",
];
const PERIOD_MONTH_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

function periodMonthLabel(month: number): string {
  if (month <= 12) return `${month}월`;
  return `익년 ${month - 12}월`;
}

function parseNumberOrNull(v: string): number | null {
  const n = Number(v.trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

function totalMonthlyTargetValue(
  monthlyTargets: Array<{ month: number; targetValue: number; note?: string | null }>,
  aggregationType: KpiAggregationType
): number | null {
  if (monthlyTargets.length === 0) return null;
  if (aggregationType === "cumulative") {
    return monthlyTargets.reduce((sum, row) => sum + row.targetValue, 0);
  }
  return monthlyTargets[monthlyTargets.length - 1]!.targetValue;
}

function sanitizeNumericInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  const normalized = cleaned.replace(/,/g, ".");
  const firstDot = normalized.indexOf(".");
  if (firstDot < 0) return normalized;
  return (
    normalized.slice(0, firstDot + 1) +
    normalized
      .slice(firstDot + 1)
      .replace(/\./g, "")
  );
}

function targetMapForRange(
  start: number,
  end: number,
  prev: Record<number, string>
): Record<number, string> {
  const next: Record<number, string> = {};
  for (let m = start; m <= end; m += 1) {
    next[m] = prev[m] ?? "";
  }
  return next;
}

function baselineToIndicatorType(baseline: BaselineOption): KpiIndicatorType {
  if (baseline === "PPM") return "ppm";
  if (baseline === "ea" || baseline === "k") return "quantity";
  if (baseline === "건") return "count";
  if (baseline === "명") return "headcount";
  if (baseline === "억") return "money";
  if (baseline === "시간") return "time";
  if (baseline === "UPH") return "uph";
  return "normal";
}

function indicatorTypeToBaseline(
  indicatorType: KpiIndicatorType,
  unit: string | null | undefined
): BaselineOption {
  if (unit && BASELINE_OPTIONS.includes(unit as BaselineOption)) {
    return unit as BaselineOption;
  }
  if (indicatorType === "ppm") return "PPM";
  if (indicatorType === "quantity") return "k";
  if (indicatorType === "count") return "건";
  if (indicatorType === "headcount") return "명";
  if (indicatorType === "money") return "억";
  if (indicatorType === "time") return "시간";
  if (indicatorType === "uph") return "UPH";
  return "%";
}

function capTextToValue(raw: string): KpiAchievementCap {
  if (raw === "none") return null;
  return raw === "120" ? 120 : 100;
}

function hasNumericText(raw: string): boolean {
  return /-?\d+(?:[.,]\d+)?/.test(raw);
}

function unavailableText(reason: string): ReactElement {
  return (
    <p className="mt-1 text-[11px] font-medium text-slate-500">
      선택 불가: {reason}
    </p>
  );
}

function UnitSuffixNearValue({
  value,
  unit,
}: {
  value: string;
  unit: string;
}): ReactElement | null {
  if (!value.trim()) return null;
  return (
    <span
      className="pointer-events-none absolute inset-y-0 left-3 flex max-w-[calc(100%-1.5rem)] items-center overflow-hidden text-sm"
      aria-hidden
    >
      <span className="invisible whitespace-pre">{value}</span>
      <span className="ml-1 shrink-0 text-xs font-semibold text-slate-500">{unit}</span>
    </span>
  );
}

function FieldHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  function show(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const width = 288;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 12
    );
    setStyle({
      position: "fixed",
      left,
      top: rect.bottom + 8,
      width,
    });
    setOpen(true);
  }
  return (
    <span className="ml-1 inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => show(e.currentTarget)}
        onMouseEnter={(e) => show(e.currentTarget)}
        onFocus={(e) => show(e.currentTarget)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          style={style}
          className="z-[9999] rounded-md border border-slate-200 bg-slate-800 px-2 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function KpiCreateModal({
  isOpen,
  onClose,
  deptId,
  deptName,
  currentWeightSum,
  mainTopicOptions,
  subTopicOptions,
  editingItem = null,
  onSubmit,
  submitting,
}: Props) {
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500";
  const textAreaClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500";
  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
  const compactControlClass = "w-full max-w-[28rem]";

  const [mainTopic, setMainTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [detailActivity, setDetailActivity] = useState("");
  const [bmText, setBmText] = useState("");
  const [evaluationType, setEvaluationType] = useState<KpiEvaluationType>("quantitative");
  const [baseline, setBaseline] = useState<BaselineOption>("%");
  const [direction, setDirection] = useState<DirectionOption>("higher");
  const [qualitativeCalcType, setQualitativeCalcType] =
    useState<KpiQualitativeCalcType>("progress");
  const [aggregationType, setAggregationType] = useState<KpiAggregationType>("monthly");
  const [targetFillPolicy, setTargetFillPolicy] =
    useState<KpiTargetFillPolicy>("exclude");
  const [achievementCapText, setAchievementCapText] = useState<"100" | "120" | "none">("100");
  const [owner, setOwner] = useState("");
  const [weightText, setWeightText] = useState("");
  const [targetValueText, setTargetValueText] = useState("");
  const [periodStartMonth, setPeriodStartMonth] = useState(1);
  const [periodEndMonth, setPeriodEndMonth] = useState(12);
  const [monthlyTargetTextByMonth, setMonthlyTargetTextByMonth] = useState<Record<number, string>>(
    () => targetMapForRange(1, 12, {})
  );
  const [monthlyTargetNoteByMonth, setMonthlyTargetNoteByMonth] = useState<Record<number, string>>(
    () => targetMapForRange(1, 12, {})
  );
  const [keepTyping, setKeepTyping] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isEditMode = Boolean(editingItem?.id);

  useEffect(() => {
    if (!isOpen) return;
    if (!editingItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달이 열릴 때 편집 대상 값을 폼 상태로 복사한다.
    setMainTopic(editingItem.mainTopic ?? "");
    setSubTopic(editingItem.subTopic ?? "");
    setDetailActivity(editingItem.detailActivity ?? "");
    setBmText(editingItem.bm === "-" ? "" : editingItem.bm ?? "");
    setOwner(editingItem.owner ?? "");
    setWeightText(editingItem.weight ?? "");
    setPeriodStartMonth(editingItem.periodStartMonth ?? 1);
    setPeriodEndMonth(editingItem.periodEndMonth ?? 12);
    setEvaluationType(editingItem.evaluationType ?? "quantitative");
    const baselineFromIndicator = indicatorTypeToBaseline(
      editingItem.indicatorType,
      editingItem.unit
    );
    setBaseline(baselineFromIndicator);
    setDirection(editingItem.targetDirection === "down" ? "lower" : "higher");
    setQualitativeCalcType(editingItem.qualitativeCalcType ?? "progress");
    setAggregationType(editingItem.aggregationType ?? "monthly");
    setTargetFillPolicy(editingItem.targetFillPolicy ?? "exclude");
    setAchievementCapText(
      editingItem.achievementCap === null
        ? "none"
        : editingItem.achievementCap === 120
          ? "120"
          : "100"
    );
    setTargetValueText(
      editingItem.targetPpm !== null && editingItem.targetPpm !== undefined
        ? String(editingItem.targetPpm)
        : ""
    );
    const start = editingItem.periodStartMonth ?? 1;
    const end = editingItem.periodEndMonth ?? 12;
    const baseMap = targetMapForRange(start, end, {});
    for (let m = start; m <= end; m += 1) {
      const val = editingItem.monthlyTargets[m];
      if (typeof val === "number" && Number.isFinite(val)) {
        baseMap[m] = String(val);
      }
    }
    setMonthlyTargetTextByMonth(baseMap);
    const noteMap = targetMapForRange(start, end, {});
    for (let m = start; m <= end; m += 1) {
      noteMap[m] = editingItem.monthlyTargetNotes[m] ?? "";
    }
    setMonthlyTargetNoteByMonth(noteMap);
    setFieldErrors({});
  }, [isOpen, editingItem]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 항목 모달을 열 때 이전 입력값을 초기화한다.
    setMainTopic("");
    setSubTopic("");
    setDetailActivity("");
    setBmText("");
    setEvaluationType("quantitative");
    setBaseline("%");
    setDirection("higher");
    setQualitativeCalcType("progress");
    setAggregationType("monthly");
    setTargetFillPolicy("exclude");
    setAchievementCapText("100");
    setOwner("");
    setWeightText("");
    setTargetValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setMonthlyTargetTextByMonth(targetMapForRange(1, 12, {}));
    setMonthlyTargetNoteByMonth(targetMapForRange(1, 12, {}));
    setKeepTyping(false);
    setFieldErrors({});
  }, [isOpen, editingItem]);

  const weightNum = parseNumberOrNull(weightText);
  const nextWeightSum = (weightNum ?? 0) + currentWeightSum;
  const supportsDirection = true;
  const usesComputedTarget =
    baseline === "PPM" ||
    baseline === "ea" ||
    baseline === "k" ||
    baseline === "건" ||
    baseline === "명" ||
    baseline === "억" ||
    baseline === "시간" ||
    baseline === "UPH" ||
    evaluationType === "qualitative";
  const isQualitative = evaluationType === "qualitative";
  const unitSuffix = baseline;
  const automaticTargetValueText = useMemo(() => {
    const rows: Array<{ month: number; targetValue: number; note?: string | null }> = [];
    for (let m = periodStartMonth; m <= periodEndMonth; m += 1) {
      const parsed = parseNumberOrNull(monthlyTargetTextByMonth[m] ?? "");
      if (parsed !== null && parsed >= 0) {
        rows.push({ month: m, targetValue: parsed });
      }
    }
    const total = totalMonthlyTargetValue(rows, aggregationType);
    return total !== null ? String(total) : "";
  }, [aggregationType, monthlyTargetTextByMonth, periodStartMonth, periodEndMonth]);
  const selectDisabledClass = "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-1 disabled:ring-slate-200";
  const inputWithUnitClass =
    "w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-14 text-sm text-slate-800 placeholder:text-slate-500";

  const weightStatus = useMemo(() => {
    if (nextWeightSum === 100) return "ok";
    if (nextWeightSum > 100) return "over";
    return "under";
  }, [nextWeightSum]);

  if (!isOpen) return null;

  function validate() {
    const errors: Record<string, string> = {};
    const weight = parseNumberOrNull(weightText);
    if (!mainTopic.trim()) errors.mainTopic = "대분류를 입력해 주세요.";
    if (!subTopic.trim()) errors.subTopic = "소분류를 입력해 주세요.";
    if (!detailActivity.trim()) errors.detailActivity = "세부 내용을 입력해 주세요.";
    if (!bmText.trim()) errors.bm = "B/M(전년실적, 벤치마크, 신규 등)을 입력해 주세요.";
    if (!owner.trim()) errors.owner = "담당자를 입력해 주세요.";
    if (!weight || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      errors.weight = "가중치는 1~100 사이 정수로 입력해 주세요.";
    }
    if (periodStartMonth > periodEndMonth) {
      errors.periodRange = "평가 종료월은 시작월보다 같거나 커야 합니다.";
    }
    if (nextWeightSum > 100) {
      errors.weight = "부서 가중치 합계가 100점을 초과합니다.";
    }

    const indicatorType =
      evaluationType === "qualitative" ? "normal" : baselineToIndicatorType(baseline);

    const monthlyTargets: Array<{ month: number; targetValue: number; note?: string | null }> = [];
    for (let m = periodStartMonth; m <= periodEndMonth; m += 1) {
      const raw = monthlyTargetTextByMonth[m] ?? "";
      if (!raw.trim()) {
        continue;
      }
      const parsed = parseNumberOrNull(raw);
      if (parsed === null || parsed < 0) {
        errors[`monthlyTarget-${m}`] = `${periodMonthLabel(m)} 목표값을 0 이상 숫자로 입력해 주세요.`;
        continue;
      }
      monthlyTargets.push({
        month: m,
        targetValue: parsed,
        note: monthlyTargetNoteByMonth[m]?.trim() || null,
      });
    }

    const finalTargetFromMonthly = totalMonthlyTargetValue(
      monthlyTargets,
      aggregationType
    );
    const targetValue = parseNumberOrNull(targetValueText);
    const autoTargetValue =
      indicatorType !== "normal" || evaluationType === "qualitative"
        ? finalTargetFromMonthly
        : targetValue;
    if (
      (indicatorType !== "normal" || evaluationType === "qualitative") &&
      (autoTargetValue === null || autoTargetValue <= 0)
    ) {
      errors.targetValue = "자동 계산용 목표값을 0보다 큰 숫자로 입력해 주세요. 목표가 없는 달은 비워둘 수 있지만 최소 1개 목표는 필요합니다.";
    }

    if (
      aggregationType !== "cumulative" &&
      monthlyTargets.length > 1 &&
      supportsDirection &&
      targetFillPolicy !== "exclude"
    ) {
      for (let i = 1; i < monthlyTargets.length; i += 1) {
        const prev = monthlyTargets[i - 1]!;
        const cur = monthlyTargets[i]!;
        if (direction === "higher" && cur.targetValue < prev.targetValue) {
          errors[`monthlyTarget-${cur.month}`] =
            "높을수록 좋음 지표는 월별 목표값이 이전 월보다 작아질 수 없습니다.";
          break;
        }
        if (direction === "lower" && cur.targetValue > prev.targetValue) {
          errors[`monthlyTarget-${cur.month}`] =
            "낮을수록 좋음 지표는 월별 목표값이 이전 월보다 커질 수 없습니다.";
          break;
        }
      }
    }

    setFieldErrors(errors);
    return {
      errors,
      weight,
      indicatorType,
      targetValue: autoTargetValue,
      monthlyTargets,
    };
  }

  function resetForNext() {
    setSubTopic("");
    setDetailActivity("");
    setBmText("");
    setWeightText("");
    setTargetValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setMonthlyTargetTextByMonth(targetMapForRange(1, 12, {}));
    setMonthlyTargetNoteByMonth(targetMapForRange(1, 12, {}));
    setFieldErrors({});
  }

  async function handleSubmit() {
    const { errors, weight, indicatorType, targetValue, monthlyTargets } = validate();
    if (Object.keys(errors).length > 0) return;
    if (weight === null) return;
    if (indicatorType !== "normal" && targetValue === null) return;

    await onSubmit(
      {
        deptId,
        mainTopic,
        subTopic,
        detailActivity,
        bmValue: bmText,
        baselineLabel: supportsDirection
          ? `${baseline} · ${evaluationType === "qualitative" ? "정성" : "정량"} (${direction === "higher" ? "높을수록 좋음" : "낮을수록 좋음"})`
          : baseline,
        owner,
        weight,
        evaluationType,
        unit: baseline,
        indicatorType,
        targetDirection: supportsDirection ? (direction === "lower" ? "down" : "up") : "na",
        targetValue: indicatorType === "normal" ? null : targetValue,
        qualitativeCalcType:
          evaluationType === "qualitative" ? qualitativeCalcType : null,
        aggregationType,
        targetFillPolicy,
        achievementCap: capTextToValue(achievementCapText),
        periodStartMonth,
        periodEndMonth,
        monthlyTargets,
      },
      editingItem?.id ? { kpiId: editingItem.id } : undefined
    );
    if (keepTyping) {
      resetForNext();
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[94vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-sky-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            {isEditMode ? "KPI 항목 수정" : "KPI 항목 추가"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{deptName} · 월별 목표값 기준으로 목표 그래프를 생성합니다.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,560px)]">
            <div className="grid gap-3 lg:grid-cols-3">
              <p className="text-xs font-semibold text-slate-500 lg:col-span-3">기본 정보</p>
              <div>
                <input className={inputClass} list="kpi-main-topic-list" placeholder="KPI 대분류" value={mainTopic} onChange={(e) => setMainTopic(e.target.value)} />
                {fieldErrors.mainTopic ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.mainTopic}</p> : null}
              </div>
              <div>
                <input className={inputClass} list="kpi-sub-topic-list" placeholder="KPI 소분류" value={subTopic} onChange={(e) => setSubTopic(e.target.value)} />
                {fieldErrors.subTopic ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.subTopic}</p> : null}
              </div>
              <div className="lg:col-span-3">
                <textarea className={textAreaClass} placeholder="세부 내용" rows={3} value={detailActivity} onChange={(e) => setDetailActivity(e.target.value)} />
                {fieldErrors.detailActivity ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.detailActivity}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  B/M
                  <FieldHint text="우리 회사의 기준값입니다. 전년실적 숫자, 외부 벤치마크, 신규 등을 입력하세요. 숫자는 그래프에서 1월 왼쪽 막대로 표시됩니다." />
                </label>
                <div className="relative">
                  <input
                    className={hasNumericText(bmText) ? inputWithUnitClass : inputClass}
                    placeholder="예: 전년 82.5, 120k, 신규, 벤치마크 95%"
                    value={bmText}
                    onChange={(e) => setBmText(e.target.value)}
                  />
                  {hasNumericText(bmText) ? (
                    <UnitSuffixNearValue value={bmText} unit={unitSuffix} />
                  ) : null}
                </div>
                {fieldErrors.bm ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.bm}</p> : null}
              </div>

              <p className="mt-1 text-xs font-semibold text-slate-500 lg:col-span-3">측정 / 담당 / 가중치</p>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  평가 유형
                  <FieldHint text="정량은 수치 실적, 정성은 진행률 또는 완료 여부를 기준으로 계산합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={evaluationType}
                  onChange={(e) => {
                    const next = e.target.value as KpiEvaluationType;
                    setEvaluationType(next);
                    if (next === "qualitative") {
                      setBaseline("%");
                      setDirection("higher");
                      setQualitativeCalcType("progress");
                      setAggregationType("monthly");
                    }
                  }}
                >
                  <option value="quantitative">정량 평가</option>
                  <option value="qualitative">정성 평가</option>
                </select>
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  측정 기준
                  <FieldHint text="%, PPM, ea, 건, 명, k, 억 등 엑셀에 나온 단위를 그대로 선택합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={baseline}
                  onChange={(e) => {
                    const nextBaseline = e.target.value as BaselineOption;
                    setBaseline(nextBaseline);
                    setDirection(nextBaseline === "PPM" || nextBaseline === "시간" ? "lower" : "higher");
                    const nextUsesComputed = nextBaseline !== "%";
                    if (nextUsesComputed) {
                      setTargetValueText(monthlyTargetTextByMonth[periodEndMonth] ?? "");
                    } else {
                      setTargetValueText("");
                    }
                  }}
                  disabled={isQualitative}
                >
                  {BASELINE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {isQualitative ? unavailableText("정성 평가는 진행률(%) 또는 완료 여부로만 계산합니다.") : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  측정 방향
                  <FieldHint text="기준이 상승/하락 성격일 때 목표 달성 방향을 선택합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as DirectionOption)}
                  disabled={isQualitative}
                >
                  <option value="higher">높을수록 좋음</option>
                  <option value="lower">낮을수록 좋음</option>
                </select>
                {isQualitative ? unavailableText("정성 평가는 진척률/완료 여부 기준으로 자동 산출됩니다.") : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  계산 기준
                  <FieldHint text="당월 단독 또는 1월부터 선택 월까지의 누적 기준으로 볼 수 있습니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={aggregationType}
                  onChange={(e) => setAggregationType(e.target.value as KpiAggregationType)}
                  disabled={isQualitative && qualitativeCalcType === "completion"}
                >
                  <option value="monthly">당월 단독</option>
                  <option value="cumulative">누적 계산</option>
                </select>
                {isQualitative && qualitativeCalcType === "completion"
                  ? unavailableText("완료형 정성 평가는 목표월 완료 여부만 평가합니다.")
                  : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  정성 계산 방식
                  <FieldHint text="진척형은 현재 진행률/목표 진행률, 완료형은 완료 시 100%·미완료 시 0%로 계산합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={qualitativeCalcType}
                  onChange={(e) => {
                    const next = e.target.value as KpiQualitativeCalcType;
                    setQualitativeCalcType(next);
                    if (next === "completion") setAggregationType("monthly");
                  }}
                  disabled={!isQualitative}
                >
                  <option value="progress">진척형</option>
                  <option value="completion">완료형</option>
                </select>
                {!isQualitative ? unavailableText("정량 평가는 목표 대비 실적 공식으로 계산합니다.") : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  목표 공백 처리
                  <FieldHint text="목표가 없는 월을 계산에서 제외하거나 직전 목표를 유지할 수 있습니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={targetFillPolicy}
                  onChange={(e) => setTargetFillPolicy(e.target.value as KpiTargetFillPolicy)}
                  disabled={isQualitative}
                >
                  <option value="exclude">목표 없는 달 제외</option>
                  <option value="carry_forward">직전 목표 유지</option>
                </select>
                {isQualitative ? unavailableText("정성 평가는 입력한 진행률 또는 완료 여부를 직접 평가합니다.") : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  달성률 상한
                  <FieldHint text="200%, 300% 같은 초과 달성을 그대로 둘지 제한할지 선택합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={achievementCapText}
                  onChange={(e) => setAchievementCapText(e.target.value as "100" | "120" | "none")}
                >
                  <option value="100">100% 제한</option>
                  <option value="120">120% 제한</option>
                  <option value="none">제한 없음</option>
                </select>
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  가중치
                  <FieldHint text="소분류 항목별 1~100 정수 입력. 부서 합계 100 권장." />
                </label>
                <input className={inputClass} placeholder="가중치(1~100)" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
                {fieldErrors.weight ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.weight}</p> : null}
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  담당자
                  <FieldHint text="해당 KPI의 담당 그룹장 이름을 입력해 주세요." />
                </label>
                <input className={inputClass} placeholder="담당자" value={owner} onChange={(e) => setOwner(e.target.value)} />
                {fieldErrors.owner ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.owner}</p> : null}
              </div>

              {usesComputedTarget ? (
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    자동계산 기준값
                    <FieldHint text="누적 계산은 입력한 월별 추가 목표값의 합계가 최종 목표값입니다. 당월 계산은 마지막 목표 월 값이 적용됩니다." />
                  </label>
                  <div className="relative">
                    <input
                      className={`${inputWithUnitClass} disabled:bg-slate-100 disabled:text-slate-500`}
                      placeholder={
                        aggregationType === "cumulative"
                          ? "월별 추가 목표값 합계로 자동 적용"
                          : "마지막 목표 월 값으로 자동 적용"
                      }
                      value={automaticTargetValueText}
                      disabled
                      readOnly
                    />
                    {automaticTargetValueText.trim() ? (
                      <UnitSuffixNearValue value={automaticTargetValueText} unit={unitSuffix} />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {aggregationType === "cumulative"
                      ? "자동 적용값: 월별 추가 목표값 합계"
                      : "자동 적용값: 마지막 목표 월 값"}
                  </p>
                  {fieldErrors.targetValue ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.targetValue}</p> : null}
                </div>
              ) : null}

              <p className="mt-1 text-xs font-semibold text-slate-500 lg:col-span-3">평가 구간</p>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  평가 시작월
                  <FieldHint text="실적을 입력받기 시작하는 기준 월입니다." />
                </label>
                <select
                  className={`${selectClass} w-full`}
                  value={periodStartMonth}
                  onChange={(e) => {
                    const nextStart = Number(e.target.value);
                    const nextEnd = Math.max(nextStart, periodEndMonth);
                    setPeriodStartMonth(nextStart);
                    setPeriodEndMonth(nextEnd);
                    setMonthlyTargetTextByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
                    setMonthlyTargetNoteByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
                  }}
                >
                  {PERIOD_MONTH_OPTIONS.map((m) => (
                    <option key={`start-${m}`} value={m}>
                      {periodMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  평가 종료월
                  <FieldHint text="실적 입력 및 달성률 평가를 마감하는 월입니다." />
                </label>
                <select
                  className={`${selectClass} w-full`}
                  value={periodEndMonth}
                  onChange={(e) => {
                    const nextEnd = Number(e.target.value);
                    const nextStart = Math.min(periodStartMonth, nextEnd);
                    setPeriodStartMonth(nextStart);
                    setPeriodEndMonth(nextEnd);
                    setMonthlyTargetTextByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
                    setMonthlyTargetNoteByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
                    if (usesComputedTarget) {
                      setTargetValueText(monthlyTargetTextByMonth[nextEnd] ?? "");
                    }
                  }}
                >
                  {PERIOD_MONTH_OPTIONS.map((m) => (
                    <option key={`end-${m}`} value={m}>
                      {periodMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              {fieldErrors.periodRange ? (
                <p className="mt-1 text-[11px] text-red-600 lg:col-span-3">{fieldErrors.periodRange}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-4">
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-600">월별 목표값 설정</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {aggregationType === "cumulative"
                    ? "누적 계산은 각 월에 추가로 달성해야 하는 목표량을 입력합니다. 예: 1월 1건, 4월 2건이면 4월 목표선은 누적 3건입니다."
                    : "목표가 있는 월만 입력할 수 있습니다. 공백 월은 선택한 공백 처리 규칙에 따라 제외하거나 직전 목표를 유지합니다."}
                </p>
              </div>
              <div className="space-y-1.5 pr-1">
                {Array.from({ length: periodEndMonth - periodStartMonth + 1 }, (_, idx) => {
                  const month = periodStartMonth + idx;
                  return (
                    <div
                      key={`monthly-target-${month}`}
                      className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <label className="pt-2 text-xs font-medium text-slate-600">
                        {periodMonthLabel(month)}
                      </label>
                      <div>
                        <div className="relative">
                          <input
                            className={inputWithUnitClass}
                            placeholder={`${periodMonthLabel(month)} 목표값 (없으면 공백)`}
                            value={monthlyTargetTextByMonth[month] ?? ""}
                            onChange={(e) => {
                              const sanitized = sanitizeNumericInput(e.target.value);
                              setMonthlyTargetTextByMonth((prev) => ({ ...prev, [month]: sanitized }));
                              if (usesComputedTarget && month === periodEndMonth) {
                                setTargetValueText(sanitized);
                              }
                            }}
                          />
                          {(monthlyTargetTextByMonth[month] ?? "").trim() ? (
                            <UnitSuffixNearValue
                              value={monthlyTargetTextByMonth[month] ?? ""}
                              unit={unitSuffix}
                            />
                          ) : null}
                        </div>
                        {fieldErrors[`monthlyTarget-${month}`] ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            {fieldErrors[`monthlyTarget-${month}`]}
                          </p>
                        ) : null}
                      </div>
                      <input
                        className={inputClass}
                        maxLength={40}
                        placeholder="목표 말풍선 (예: 검토, 제작)"
                        value={monthlyTargetNoteByMonth[month] ?? ""}
                        onChange={(e) =>
                          setMonthlyTargetNoteByMonth((prev) => ({
                            ...prev,
                            [month]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <datalist id="kpi-main-topic-list">
            {mainTopicOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
          <datalist id="kpi-sub-topic-list">
            {subTopicOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>

        <div className="px-5 pb-1 text-sm">
          <span
            className={
              weightStatus === "ok"
                ? "text-emerald-700"
                : weightStatus === "over"
                  ? "text-red-700"
                  : "text-amber-700"
            }
          >
            {nextWeightSum === 100
              ? "가중치 합계 100/100 (정상)"
              : nextWeightSum > 100
                ? `가중치 합계 ${nextWeightSum}/100 (${nextWeightSum - 100}점 초과 - 조정 필요)`
                : `가중치 합계 ${nextWeightSum}/100 (${100 - nextWeightSum}점 미배분)`}
          </span>
          <p className="mt-1 text-[11px] text-slate-500">100 초과는 저장할 수 없고, 100 미만은 저장 가능(경고)합니다.</p>
        </div>

        <div className="shrink-0 flex justify-end gap-2 border-t border-sky-100 px-5 py-4">
          {!isEditMode ? (
            <label className="mr-auto inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={keepTyping}
                onChange={(e) => setKeepTyping(e.target.checked)}
              />
              저장 후 계속 입력
            </label>
          ) : (
            <div className="mr-auto" />
          )}
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" onClick={onClose}>
            취소
          </button>
          <button
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {isEditMode ? "수정 저장" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
