"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import {
  isDefaultMonthlyTargetNote,
  type CreateManualKpiInput,
  type KpiAchievementCap,
  type KpiAggregationType,
  type KpiEvaluationType,
  type KpiIndicatorType,
  type KpiQualitativeCalcType,
  type KpiTargetFillPolicy,
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
    linkedSecondary?: {
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
  } | null;
  onSubmit: (payloads: CreateManualKpiInput[], options?: { kpiId?: string }) => Promise<void>;
  submitting: boolean;
};

type BaselineOption =
  | "%"
  | "수율(%)"
  | "PPM"
  | "ea"
  | "건"
  | "명"
  | "k"
  | "억"
  | "분(min)"
  | "시간(hr)"
  | "UPH"
  | "Cpk";

type DirectionOption = "higher" | "lower";

const BASELINE_OPTIONS: BaselineOption[] = [
  "%",
  "수율(%)",
  "PPM",
  "ea",
  "건",
  "명",
  "k",
  "억",
  "분(min)",
  "시간(hr)",
  "UPH",
  "Cpk",
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

type MonthlyTargetRow = { month: number; targetValue: number; note?: string | null };

function validateMonthlyBand(input: {
  textByMonth: Record<number, string>;
  noteByMonth: Record<number, string>;
  periodStartMonth: number;
  periodEndMonth: number;
  errorKeyPrefix: string;
  aggregationType: KpiAggregationType;
  supportsDirection: boolean;
  targetFillPolicy: KpiTargetFillPolicy;
  direction: DirectionOption;
}): { monthlyTargets: MonthlyTargetRow[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const monthlyTargets: MonthlyTargetRow[] = [];
  for (let m = input.periodStartMonth; m <= input.periodEndMonth; m += 1) {
    const raw = input.textByMonth[m] ?? "";
    if (!raw.trim()) {
      continue;
    }
    const parsed = parseNumberOrNull(raw);
    if (parsed === null || parsed < 0) {
      errors[`${input.errorKeyPrefix}${m}`] = `${periodMonthLabel(m)} 목표값을 0 이상 숫자로 입력해 주세요.`;
      continue;
    }
    monthlyTargets.push({
      month: m,
      targetValue: parsed,
      note: normalizeTargetNoteInput(input.noteByMonth[m]) || null,
    });
  }
  if (
    input.aggregationType !== "cumulative" &&
    monthlyTargets.length > 1 &&
    input.supportsDirection &&
    input.targetFillPolicy !== "exclude"
  ) {
    for (let i = 1; i < monthlyTargets.length; i += 1) {
      const prev = monthlyTargets[i - 1]!;
      const cur = monthlyTargets[i]!;
      if (input.direction === "higher" && cur.targetValue < prev.targetValue) {
        errors[`${input.errorKeyPrefix}${cur.month}`] =
          "높을수록 좋음 지표는 월별 목표값이 이전 월보다 작아질 수 없습니다.";
        break;
      }
      if (input.direction === "lower" && cur.targetValue > prev.targetValue) {
        errors[`${input.errorKeyPrefix}${cur.month}`] =
          "낮을수록 좋음 지표는 월별 목표값이 이전 월보다 커질 수 없습니다.";
        break;
      }
    }
  }
  return { monthlyTargets, errors };
}

function composeManualKpiPayload(input: {
  deptId: string;
  mainTopic: string;
  subTopic: string;
  detailActivity: string;
  bmValue: string;
  baseline: BaselineOption;
  evaluationType: KpiEvaluationType;
  direction: DirectionOption;
  qualitativeCalcType: KpiQualitativeCalcType;
  aggregationType: KpiAggregationType;
  targetFillPolicy: KpiTargetFillPolicy;
  achievementCapText: "100" | "120" | "none";
  owner: string;
  weight: number;
  targetValueText: string;
  periodStartMonth: number;
  periodEndMonth: number;
  monthlyTargets: MonthlyTargetRow[];
}): CreateManualKpiInput {
  const supportsDirection = true;
  const indicatorType =
    input.evaluationType === "qualitative" ? "normal" : baselineToIndicatorType(input.baseline);
  const finalFromRows = totalMonthlyTargetValue(input.monthlyTargets, input.aggregationType);
  const tvManual = parseNumberOrNull(input.targetValueText);
  const autoTargetValue =
    indicatorType !== "normal" || input.evaluationType === "qualitative"
      ? finalFromRows
      : tvManual;
  return {
    deptId: input.deptId,
    mainTopic: input.mainTopic,
    subTopic: input.subTopic,
    detailActivity: input.detailActivity.trim(),
    bmValue: input.bmValue.trim(),
    baselineLabel: supportsDirection
      ? `${input.baseline} · ${input.evaluationType === "qualitative" ? "정성" : "정량"} (${input.direction === "higher" ? "높을수록 좋음" : "낮을수록 좋음"})`
      : input.baseline,
    owner: input.owner.trim(),
    weight: input.weight,
    evaluationType: input.evaluationType,
    unit: input.baseline,
    indicatorType,
    targetDirection: supportsDirection ? (input.direction === "lower" ? "down" : "up") : "na",
    targetValue: indicatorType === "normal" ? null : autoTargetValue,
    qualitativeCalcType:
      input.evaluationType === "qualitative" ? input.qualitativeCalcType : null,
    aggregationType: input.aggregationType,
    targetFillPolicy: input.targetFillPolicy,
    achievementCap: capTextToValue(input.achievementCapText),
    periodStartMonth: input.periodStartMonth,
    periodEndMonth: input.periodEndMonth,
    monthlyTargets: input.monthlyTargets,
  };
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

function normalizeTargetNoteInput(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  return text && !isDefaultMonthlyTargetNote(text) ? text : "";
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
  if (baseline === "수율(%)") return "normal";
  if (baseline === "PPM") return "ppm";
  if (baseline === "ea" || baseline === "k") return "quantity";
  if (baseline === "건") return "count";
  if (baseline === "명") return "headcount";
  if (baseline === "억") return "money";
  if (baseline === "분(min)") return "minutes";
  if (baseline === "시간(hr)") return "time";
  if (baseline === "UPH") return "uph";
  if (baseline === "Cpk") return "cpk";
  return "normal";
}

function indicatorTypeToBaseline(
  indicatorType: KpiIndicatorType,
  unit: string | null | undefined
): BaselineOption {
  if (unit && BASELINE_OPTIONS.includes(unit as BaselineOption)) {
    return unit as BaselineOption;
  }
  if (unit === "시간") return "시간(hr)";
  if (unit === "분") return "분(min)";
  if (indicatorType === "ppm") return "PPM";
  if (indicatorType === "quantity") return "k";
  if (indicatorType === "count") return "건";
  if (indicatorType === "headcount") return "명";
  if (indicatorType === "money") return "억";
  if (indicatorType === "time") return "시간(hr)";
  if (indicatorType === "minutes") return "분(min)";
  if (indicatorType === "uph") return "UPH";
  if (indicatorType === "cpk") return "Cpk";
  if (indicatorType === "normal") {
    const u = String(unit ?? "").trim();
    if (/수율|yield/i.test(u)) return "수율(%)";
    return "%";
  }
  return "%";
}

function capTextToValue(_raw: string): KpiAchievementCap {
  return 100;
}

/** B/M 등: 문자열 전체가 하나의 수일 때만 단위 접미(%) 표시. "1st"처럼 숫자+문자는 제외 */
function isWholeFieldNumericForUnitSuffix(raw: string): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  if (!/^[-+]?(?:\d+(?:[.,]\d*)?|\d*[.,]\d+)$/.test(t)) return false;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n);
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
        tabIndex={-1}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => show(e.currentTarget)}
        onMouseEnter={(e) => show(e.currentTarget)}
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
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [monthlyTargetTextByMonthB, setMonthlyTargetTextByMonthB] = useState<Record<number, string>>(
    () => targetMapForRange(1, 12, {})
  );
  const [monthlyTargetNoteByMonthB, setMonthlyTargetNoteByMonthB] = useState<Record<number, string>>(
    () => targetMapForRange(1, 12, {})
  );
  const [weight2Text, setWeight2Text] = useState("");
  const [detailActivityB, setDetailActivityB] = useState("");
  const [bmTextB, setBmTextB] = useState("");
  const [evaluationTypeB, setEvaluationTypeB] = useState<KpiEvaluationType>("quantitative");
  const [baselineB, setBaselineB] = useState<BaselineOption>("%");
  const [directionB, setDirectionB] = useState<DirectionOption>("higher");
  const [qualitativeCalcTypeB, setQualitativeCalcTypeB] =
    useState<KpiQualitativeCalcType>("progress");
  const [aggregationTypeB, setAggregationTypeB] = useState<KpiAggregationType>("monthly");
  const [targetFillPolicyB, setTargetFillPolicyB] = useState<KpiTargetFillPolicy>("exclude");
  const [achievementCapTextB, setAchievementCapTextB] = useState<"100" | "120" | "none">("100");
  const [ownerB, setOwnerB] = useState("");
  const [targetValueTextB, setTargetValueTextB] = useState("");
  const [periodStartMonthB, setPeriodStartMonthB] = useState(1);
  const [periodEndMonthB, setPeriodEndMonthB] = useState(12);
  const [keepTyping, setKeepTyping] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editGoalTab, setEditGoalTab] = useState<"primary" | "secondary">("primary");
  const isEditMode = Boolean(editingItem?.id);
  const hasLinkedSecondaryInEdit = Boolean(editingItem?.linkedSecondary?.id);

  function applyEditingSourceToForm(
    source:
      | NonNullable<Props["editingItem"]>
      | NonNullable<NonNullable<Props["editingItem"]>["linkedSecondary"]>
  ) {
    setMainTopic(source.mainTopic ?? "");
    setSubTopic(source.subTopic ?? "");
    setDetailActivity(source.detailActivity ?? "");
    setBmText(source.bm === "-" ? "" : source.bm ?? "");
    setOwner(source.owner ?? "");
    setWeightText(source.weight ?? "");
    setPeriodStartMonth(source.periodStartMonth ?? 1);
    setPeriodEndMonth(source.periodEndMonth ?? 12);
    setEvaluationType(source.evaluationType ?? "quantitative");
    const baselineFromIndicator = indicatorTypeToBaseline(
      source.indicatorType,
      source.unit
    );
    setBaseline(baselineFromIndicator);
    setDirection(source.targetDirection === "down" ? "lower" : "higher");
    setQualitativeCalcType(source.qualitativeCalcType ?? "progress");
    setAggregationType(source.aggregationType ?? "monthly");
    setTargetFillPolicy(source.targetFillPolicy ?? "exclude");
    setAchievementCapText("100");
    setTargetValueText(
      source.targetPpm !== null && source.targetPpm !== undefined
        ? String(source.targetPpm)
        : ""
    );
    const start = source.periodStartMonth ?? 1;
    const end = source.periodEndMonth ?? 12;
    const baseMap = targetMapForRange(start, end, {});
    for (let m = start; m <= end; m += 1) {
      const val = source.monthlyTargets[m];
      if (typeof val === "number" && Number.isFinite(val)) {
        baseMap[m] = String(val);
      }
    }
    setMonthlyTargetTextByMonth(baseMap);
    const noteMap = targetMapForRange(start, end, {});
    for (let m = start; m <= end; m += 1) {
      noteMap[m] = normalizeTargetNoteInput(source.monthlyTargetNotes[m]);
    }
    setMonthlyTargetNoteByMonth(noteMap);
  }

  useEffect(() => {
    if (!isOpen) return;
    if (!editingItem) return;
    setEditGoalTab("primary");
    applyEditingSourceToForm(editingItem);
    setWizardStep(1);
    const start = editingItem.periodStartMonth ?? 1;
    const end = editingItem.periodEndMonth ?? 12;
    setMonthlyTargetTextByMonthB(targetMapForRange(start, end, {}));
    setMonthlyTargetNoteByMonthB(targetMapForRange(start, end, {}));
    setWeight2Text("");
    setDetailActivityB("");
    setBmTextB("");
    setEvaluationTypeB("quantitative");
    setBaselineB("%");
    setDirectionB("higher");
    setQualitativeCalcTypeB("progress");
    setAggregationTypeB("monthly");
    setTargetFillPolicyB("exclude");
    setAchievementCapTextB("100");
    setOwnerB("");
    setTargetValueTextB("");
    setPeriodStartMonthB(start);
    setPeriodEndMonthB(end);
    setFieldErrors({});
  }, [isOpen, editingItem]);

  useEffect(() => {
    if (!isOpen || !editingItem || !isEditMode) return;
    if (editGoalTab === "secondary" && editingItem.linkedSecondary) {
      applyEditingSourceToForm(editingItem.linkedSecondary);
    } else {
      applyEditingSourceToForm(editingItem);
    }
    setFieldErrors({});
  }, [isOpen, isEditMode, editGoalTab, editingItem]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 항목 모달을 열 때 이전 입력값을 초기화한다.
    setWizardStep(1);
    setMonthlyTargetTextByMonthB(targetMapForRange(1, 12, {}));
    setMonthlyTargetNoteByMonthB(targetMapForRange(1, 12, {}));
    setWeight2Text("");
    setDetailActivityB("");
    setBmTextB("");
    setEvaluationTypeB("quantitative");
    setBaselineB("%");
    setDirectionB("higher");
    setQualitativeCalcTypeB("progress");
    setAggregationTypeB("monthly");
    setTargetFillPolicyB("exclude");
    setAchievementCapTextB("100");
    setOwnerB("");
    setTargetValueTextB("");
    setPeriodStartMonthB(1);
    setPeriodEndMonthB(12);
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
  const primaryWeightInEdit = parseNumberOrNull(editingItem?.weight ?? "") ?? 0;
  const secondaryWeightInEdit =
    parseNumberOrNull(editingItem?.linkedSecondary?.weight ?? "") ?? 0;
  const effectiveCurrentWeightSum =
    isEditMode && editGoalTab === "secondary" && hasLinkedSecondaryInEdit
      ? currentWeightSum + primaryWeightInEdit - secondaryWeightInEdit
      : currentWeightSum;
  const nextWeightSum = (weightNum ?? 0) + effectiveCurrentWeightSum;
  const supportsDirection = true;
  const usesComputedTarget =
    baseline === "PPM" ||
    baseline === "ea" ||
    baseline === "k" ||
    baseline === "건" ||
    baseline === "명" ||
    baseline === "억" ||
    baseline === "분(min)" ||
    baseline === "시간(hr)" ||
    baseline === "UPH" ||
    baseline === "Cpk" ||
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

  const usesComputedTargetB =
    baselineB === "PPM" ||
    baselineB === "ea" ||
    baselineB === "k" ||
    baselineB === "건" ||
    baselineB === "명" ||
    baselineB === "억" ||
    baselineB === "분(min)" ||
    baselineB === "시간(hr)" ||
    baselineB === "UPH" ||
    baselineB === "Cpk" ||
    evaluationTypeB === "qualitative";
  const isQualitativeB = evaluationTypeB === "qualitative";
  const unitSuffixB = baselineB;
  const automaticTargetValueTextB = useMemo(() => {
    const rows: Array<{ month: number; targetValue: number; note?: string | null }> = [];
    for (let m = periodStartMonthB; m <= periodEndMonthB; m += 1) {
      const parsed = parseNumberOrNull(monthlyTargetTextByMonthB[m] ?? "");
      if (parsed !== null && parsed >= 0) {
        rows.push({ month: m, targetValue: parsed });
      }
    }
    const total = totalMonthlyTargetValue(rows, aggregationTypeB);
    return total !== null ? String(total) : "";
  }, [aggregationTypeB, monthlyTargetTextByMonthB, periodStartMonthB, periodEndMonthB]);

  const selectDisabledClass = "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-1 disabled:ring-slate-200";
  const inputWithUnitClass =
    "w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-14 text-sm text-slate-800 placeholder:text-slate-500";

  const weightStatus = useMemo(() => {
    if (nextWeightSum === 100) return "ok";
    if (nextWeightSum > 100) return "over";
    return "under";
  }, [nextWeightSum]);

  const weight2Num = parseNumberOrNull(weight2Text);
  const nextWeightSumDual =
    (weightNum ?? 0) + (weight2Num ?? 0) + effectiveCurrentWeightSum;

  if (!isOpen) return null;

  type ValidateMode = "primaryOnly" | "withOptionalSecond";

  function validate(mode: ValidateMode) {
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

    const indicatorType =
      evaluationType === "qualitative" ? "normal" : baselineToIndicatorType(baseline);

    const bandA = validateMonthlyBand({
      textByMonth: monthlyTargetTextByMonth,
      noteByMonth: monthlyTargetNoteByMonth,
      periodStartMonth,
      periodEndMonth,
      errorKeyPrefix: "monthlyTarget-",
      aggregationType,
      supportsDirection,
      targetFillPolicy,
      direction,
    });
    Object.assign(errors, bandA.errors);
    const monthlyTargets = bandA.monthlyTargets;

    const finalTargetFromMonthly = totalMonthlyTargetValue(monthlyTargets, aggregationType);
    const targetValue = parseNumberOrNull(targetValueText);
    const autoTargetValue =
      indicatorType !== "normal" || evaluationType === "qualitative"
        ? finalTargetFromMonthly
        : targetValue;
    if (
      (indicatorType !== "normal" || evaluationType === "qualitative") &&
      autoTargetValue === null
    ) {
      errors.targetValue = "자동 계산용 목표값을 입력해 주세요. 목표가 없는 달은 비워둘 수 있지만 최소 1개 목표는 필요합니다.";
    }

    let monthlyTargetsB: MonthlyTargetRow[] = [];
    let weight2: number | null = null;
    let hasSecond = false;

    if (mode === "withOptionalSecond") {
      const bandB = validateMonthlyBand({
        textByMonth: monthlyTargetTextByMonthB,
        noteByMonth: monthlyTargetNoteByMonthB,
        periodStartMonth: periodStartMonthB,
        periodEndMonth: periodEndMonthB,
        errorKeyPrefix: "2-monthlyTarget-",
        aggregationType: aggregationTypeB,
        supportsDirection: true,
        targetFillPolicy: targetFillPolicyB,
        direction: directionB,
      });
      Object.assign(errors, bandB.errors);
      monthlyTargetsB = bandB.monthlyTargets;
      hasSecond = monthlyTargetsB.length > 0;
      if (hasSecond) {
        if (!detailActivityB.trim()) {
          errors["2-detailActivity"] = "세부 내용을 입력해 주세요.";
        }
        if (!bmTextB.trim()) {
          errors["2-bm"] = "B/M(전년실적, 벤치마크, 신규 등)을 입력해 주세요.";
        }
        if (!ownerB.trim()) {
          errors["2-owner"] = "담당자를 입력해 주세요.";
        }
        weight2 = parseNumberOrNull(weight2Text);
        if (!weight2 || !Number.isInteger(weight2) || weight2 < 1 || weight2 > 100) {
          errors.weight2 = "가중치는 1~100 사이 정수로 입력해 주세요.";
        }
        if (periodStartMonthB > periodEndMonthB) {
          errors["2-periodRange"] = "평가 종료월은 시작월보다 같거나 커야 합니다.";
        }
        if (
          weight &&
          weight2 &&
          Number.isInteger(weight) &&
          Number.isInteger(weight2) &&
          effectiveCurrentWeightSum + weight + weight2 > 100
        ) {
          errors.weight2 = "첫·두 번째 목표 가중치 합이 부서 한도(100점)를 초과합니다.";
        }
        const indicatorTypeB =
          evaluationTypeB === "qualitative" ? "normal" : baselineToIndicatorType(baselineB);
        const finalTargetFromMonthlyB = totalMonthlyTargetValue(monthlyTargetsB, aggregationTypeB);
        const targetValueBManual = parseNumberOrNull(targetValueTextB);
        const autoTargetValueB =
          indicatorTypeB !== "normal" || evaluationTypeB === "qualitative"
            ? finalTargetFromMonthlyB
            : targetValueBManual;
        if (
          (indicatorTypeB !== "normal" || evaluationTypeB === "qualitative") &&
          autoTargetValueB === null
        ) {
          errors["2-targetValue"] =
            "자동 계산용 목표값을 입력해 주세요. 목표가 없는 달은 비워둘 수 있지만 최소 1개 목표는 필요합니다.";
        }
      }
    }

    if (mode === "primaryOnly") {
      if (nextWeightSum > 100) {
        errors.weight = "부서 가중치 합계가 100점을 초과합니다.";
      }
    } else if (!hasSecond) {
      if (nextWeightSum > 100) {
        errors.weight = "부서 가중치 합계가 100점을 초과합니다.";
      }
    }

    setFieldErrors(errors);
    return {
      errors,
      weight,
      weight2,
      hasSecond,
      indicatorType,
      targetValue: autoTargetValue,
      monthlyTargets,
      monthlyTargetsB,
    };
  }

  function resetForNext() {
    setWizardStep(1);
    setSubTopic("");
    setDetailActivity("");
    setBmText("");
    setWeightText("");
    setWeight2Text("");
    setTargetValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setMonthlyTargetTextByMonth(targetMapForRange(1, 12, {}));
    setMonthlyTargetNoteByMonth(targetMapForRange(1, 12, {}));
    setMonthlyTargetTextByMonthB(targetMapForRange(1, 12, {}));
    setMonthlyTargetNoteByMonthB(targetMapForRange(1, 12, {}));
    setDetailActivityB("");
    setBmTextB("");
    setEvaluationTypeB("quantitative");
    setBaselineB("%");
    setDirectionB("higher");
    setQualitativeCalcTypeB("progress");
    setAggregationTypeB("monthly");
    setTargetFillPolicyB("exclude");
    setAchievementCapTextB("100");
    setOwnerB("");
    setTargetValueTextB("");
    setPeriodStartMonthB(1);
    setPeriodEndMonthB(12);
    setFieldErrors({});
  }

  function handleStep1Next() {
    const { errors } = validate("primaryOnly");
    if (Object.keys(errors).length > 0) return;
    const ps = periodStartMonth;
    const pe = periodEndMonth;
    setPeriodStartMonthB(ps);
    setPeriodEndMonthB(pe);
    setMonthlyTargetTextByMonthB(targetMapForRange(ps, pe, {}));
    setMonthlyTargetNoteByMonthB(targetMapForRange(ps, pe, {}));
    setDetailActivityB("");
    setBmTextB("");
    setEvaluationTypeB("quantitative");
    setBaselineB("%");
    setDirectionB("higher");
    setQualitativeCalcTypeB("progress");
    setAggregationTypeB("monthly");
    setTargetFillPolicyB("exclude");
    setAchievementCapTextB("100");
    setOwnerB("");
    setWeight2Text("");
    setTargetValueTextB("");
    setWizardStep(2);
  }

  function goBackToWizardStep1() {
    setWizardStep(1);
    setFieldErrors({});
  }

  async function handleSubmitPrimary() {
    const { errors, weight, indicatorType, targetValue, monthlyTargets } = validate("primaryOnly");
    if (Object.keys(errors).length > 0) return;
    if (weight === null) return;
    if (indicatorType !== "normal" && targetValue === null) return;

    const editKpiId =
      editGoalTab === "secondary" && editingItem?.linkedSecondary?.id
        ? editingItem.linkedSecondary.id
        : editingItem?.id;
    await onSubmit(
      [
        composeManualKpiPayload({
          deptId,
          mainTopic,
          subTopic,
          detailActivity,
          bmValue: bmText,
          baseline,
          evaluationType,
          direction,
          qualitativeCalcType,
          aggregationType,
          targetFillPolicy,
          achievementCapText,
          owner,
          weight,
          targetValueText,
          periodStartMonth,
          periodEndMonth,
          monthlyTargets,
        }),
      ],
      editingItem?.id ? { kpiId: editingItem.id } : undefined
    );
    if (keepTyping) {
      resetForNext();
      return;
    }
    onClose();
  }

  async function handleSubmitFromStep2() {
    const { errors, weight, weight2, hasSecond, indicatorType, targetValue, monthlyTargets, monthlyTargetsB } =
      validate("withOptionalSecond");
    if (Object.keys(errors).length > 0) return;
    if (weight === null) return;
    if (indicatorType !== "normal" && targetValue === null) return;

    const payloads: CreateManualKpiInput[] = [
      composeManualKpiPayload({
        deptId,
        mainTopic,
        subTopic,
        detailActivity,
        bmValue: bmText,
        baseline,
        evaluationType,
        direction,
        qualitativeCalcType,
        aggregationType,
        targetFillPolicy,
        achievementCapText,
        owner,
        weight,
        targetValueText,
        periodStartMonth,
        periodEndMonth,
        monthlyTargets,
      }),
    ];
    if (hasSecond && weight2 !== null) {
      payloads.push(
        composeManualKpiPayload({
          deptId,
          mainTopic,
          subTopic,
          detailActivity: detailActivityB,
          bmValue: bmTextB,
          baseline: baselineB,
          evaluationType: evaluationTypeB,
          direction: directionB,
          qualitativeCalcType: qualitativeCalcTypeB,
          aggregationType: aggregationTypeB,
          targetFillPolicy: targetFillPolicyB,
          achievementCapText: achievementCapTextB,
          owner: ownerB,
          weight: weight2,
          targetValueText: targetValueTextB,
          periodStartMonth: periodStartMonthB,
          periodEndMonth: periodEndMonthB,
          monthlyTargets: monthlyTargetsB,
        })
      );
    }

    await onSubmit(payloads, editingItem?.id ? { kpiId: editingItem.id } : undefined);
    if (keepTyping) {
      resetForNext();
      return;
    }
    onClose();
  }

  async function handleSubmitEdit() {
    const { errors, weight, indicatorType, targetValue, monthlyTargets } = validate("primaryOnly");
    if (Object.keys(errors).length > 0) return;
    if (weight === null) return;
    if (indicatorType !== "normal" && targetValue === null) return;
    const editKpiId =
      editGoalTab === "secondary" && editingItem?.linkedSecondary?.id
        ? editingItem.linkedSecondary.id
        : editingItem?.id;

    await onSubmit(
      [
        composeManualKpiPayload({
          deptId,
          mainTopic,
          subTopic,
          detailActivity,
          bmValue: bmText,
          baseline,
          evaluationType,
          direction,
          qualitativeCalcType,
          aggregationType,
          targetFillPolicy,
          achievementCapText,
          owner,
          weight,
          targetValueText,
          periodStartMonth,
          periodEndMonth,
          monthlyTargets,
        }),
      ],
      editKpiId ? { kpiId: editKpiId } : undefined
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[94vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-sky-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            {isEditMode ? "KPI 항목 수정" : "KPI 항목 추가"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {deptName} · 월별 목표값 기준으로 목표 그래프를 생성합니다.
            {!isEditMode && wizardStep === 2 ? (
              <span className="ml-2 font-semibold text-sky-700">(2단계: 두 번째 목표)</span>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!isEditMode && wizardStep === 2 ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,560px)]">
              <div className="flex flex-col gap-3 border-b border-sky-100 pb-3 xl:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={goBackToWizardStep1}
                >
                  ← 1단계로 돌아가기
                </button>
                <p className="min-w-0 text-xs text-slate-600">
                  월별 목표를 <strong className="text-slate-800">모두 비우면</strong> 저장 시 첫 번째 목표만 등록됩니다.
                  KPI 대분류·소분류는 1단계와 동일합니다(아래 읽기 전용).
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <p className="text-xs font-semibold text-slate-500 lg:col-span-3">기본 정보</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">KPI 대분류 (1단계와 동일)</label>
                  <input
                    className={`${inputClass} bg-slate-50`}
                    readOnly
                    tabIndex={-1}
                    value={mainTopic}
                    aria-readonly="true"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">KPI 소분류 (1단계와 동일)</label>
                  <input
                    className={`${inputClass} bg-slate-50`}
                    readOnly
                    tabIndex={-1}
                    value={subTopic}
                    aria-readonly="true"
                  />
                </div>
                <div className="lg:col-span-3">
                  <textarea
                    className={textAreaClass}
                    placeholder="세부 내용"
                    rows={3}
                    value={detailActivityB}
                    onChange={(e) => setDetailActivityB(e.target.value)}
                  />
                  {fieldErrors["2-detailActivity"] ? (
                    <p className="mt-1 text-[11px] text-red-600">{fieldErrors["2-detailActivity"]}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    B/M
                    <FieldHint text="우리 회사의 기준값입니다. 전년실적 숫자, 외부 벤치마크, 신규 등을 입력하세요. 숫자는 그래프에서 1월 왼쪽 막대로 표시됩니다." />
                  </label>
                  <div className="relative">
                    <input
                      className={isWholeFieldNumericForUnitSuffix(bmTextB) ? inputWithUnitClass : inputClass}
                      placeholder="예: 전년 82.5, 120k, 신규, 벤치마크 95%"
                      value={bmTextB}
                      onChange={(e) => setBmTextB(e.target.value)}
                    />
                    {isWholeFieldNumericForUnitSuffix(bmTextB) ? (
                      <UnitSuffixNearValue value={bmTextB} unit={unitSuffixB} />
                    ) : null}
                  </div>
                  {fieldErrors["2-bm"] ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors["2-bm"]}</p> : null}
                </div>

                <p className="mt-1 text-xs font-semibold text-slate-500 lg:col-span-3">측정 / 담당 / 가중치</p>
                <div className={compactControlClass}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    평가 유형
                    <FieldHint text="정량은 수치 실적, 정성은 진행률 또는 완료 여부를 기준으로 계산합니다." />
                  </label>
                  <select
                    className={`${selectClass} w-full ${selectDisabledClass}`}
                    value={evaluationTypeB}
                    onChange={(e) => {
                      const next = e.target.value as KpiEvaluationType;
                      setEvaluationTypeB(next);
                      if (next === "qualitative") {
                        setBaselineB("%");
                        setDirectionB("higher");
                        setQualitativeCalcTypeB("progress");
                        setAggregationTypeB("monthly");
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
                    <FieldHint text="%, 수율(%), PPM, ea·건·명·k·억, 분(min), 시간(hr), UPH, Cpk 등 프로젝트 단위에 맞게 선택합니다." />
                  </label>
                  <select
                    className={`${selectClass} w-full ${selectDisabledClass}`}
                    value={baselineB}
                    onChange={(e) => {
                      const nextBaseline = e.target.value as BaselineOption;
                      setBaselineB(nextBaseline);
                      setDirectionB(
                        nextBaseline === "PPM" ||
                          nextBaseline === "시간(hr)" ||
                          nextBaseline === "분(min)"
                          ? "lower"
                          : "higher",
                      );
                      const nextUsesComputed = nextBaseline !== "%";
                      if (nextUsesComputed) {
                        setTargetValueTextB(monthlyTargetTextByMonthB[periodEndMonthB] ?? "");
                      } else {
                        setTargetValueTextB("");
                      }
                    }}
                    disabled={isQualitativeB}
                  >
                    {BASELINE_OPTIONS.map((opt) => (
                      <option key={`b-${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {isQualitativeB ? unavailableText("정성 평가는 진행률(%) 또는 완료 여부로만 계산합니다.") : null}
                </div>
                <div className={compactControlClass}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    측정 방향
                    <FieldHint text="기준이 상승/하락 성격일 때 목표 달성 방향을 선택합니다." />
                  </label>
                  <select
                    className={`${selectClass} w-full ${selectDisabledClass}`}
                    value={directionB}
                    onChange={(e) => setDirectionB(e.target.value as DirectionOption)}
                    disabled={isQualitativeB}
                  >
                    <option value="higher">높을수록 좋음</option>
                    <option value="lower">낮을수록 좋음</option>
                  </select>
                  {isQualitativeB ? unavailableText("정성 평가는 진척률/완료 여부 기준으로 자동 산출됩니다.") : null}
                </div>
                <div className={compactControlClass}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    계산 기준
                    <FieldHint text="당월 단독 또는 1월부터 선택 월까지의 누적 기준으로 볼 수 있습니다." />
                  </label>
                  <select
                    className={`${selectClass} w-full ${selectDisabledClass}`}
                    value={aggregationTypeB}
                    onChange={(e) => setAggregationTypeB(e.target.value as KpiAggregationType)}
                    disabled={isQualitativeB && qualitativeCalcTypeB === "completion"}
                  >
                    <option value="monthly">당월 단독</option>
                    <option value="cumulative">누적 계산</option>
                  </select>
                  {isQualitativeB && qualitativeCalcTypeB === "completion"
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
                    value={qualitativeCalcTypeB}
                    onChange={(e) => {
                      const next = e.target.value as KpiQualitativeCalcType;
                      setQualitativeCalcTypeB(next);
                      if (next === "completion") setAggregationTypeB("monthly");
                    }}
                    disabled={!isQualitativeB}
                  >
                    <option value="progress">진척형</option>
                    <option value="completion">완료형</option>
                  </select>
                  {!isQualitativeB ? unavailableText("정량 평가는 목표 대비 실적 공식으로 계산합니다.") : null}
                </div>
                <div className={compactControlClass}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    목표 공백 처리
                    <FieldHint text="목표가 없는 월을 계산에서 제외하거나 직전 목표를 유지할 수 있습니다." />
                  </label>
                  <select
                    className={`${selectClass} w-full ${selectDisabledClass}`}
                    value={targetFillPolicyB}
                    onChange={(e) => setTargetFillPolicyB(e.target.value as KpiTargetFillPolicy)}
                    disabled={isQualitativeB}
                  >
                    <option value="exclude">목표 없는 달 제외</option>
                    <option value="carry_forward">직전 목표 유지</option>
                  </select>
                  {isQualitativeB ? unavailableText("정성 평가는 입력한 진행률 또는 완료 여부를 직접 평가합니다.") : null}
                </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  달성률 상한
                  <FieldHint text="달성률은 최대 100%로 고정됩니다." />
                </label>
                <p className={`${inputClass} bg-slate-50 text-slate-600`}>100% 제한</p>
              </div>
              <div className={compactControlClass}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  가중치
                    <FieldHint text="첫 번째 목표와 합쳐 부서 합계 100점을 넘지 않게 입력합니다. 월별 목표를 입력한 경우에만 저장 시 반영됩니다." />
                  </label>
                  <input
                    className={inputClass}
                    placeholder="가중치(1~100)"
                    value={weight2Text}
                    onChange={(e) => setWeight2Text(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  {fieldErrors.weight2 ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.weight2}</p> : null}
                </div>
                <div className={compactControlClass}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    담당자
                    <FieldHint text="해당 KPI의 담당 그룹장 이름을 입력해 주세요." />
                  </label>
                  <input
                    className={inputClass}
                    placeholder="담당자"
                    value={ownerB}
                    onChange={(e) => setOwnerB(e.target.value)}
                  />
                  {fieldErrors["2-owner"] ? (
                    <p className="mt-1 text-[11px] text-red-600">{fieldErrors["2-owner"]}</p>
                  ) : null}
                </div>

                {usesComputedTargetB ? (
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      자동계산 기준값
                      <FieldHint text="누적 계산은 입력한 월별 추가 목표값의 합계가 최종 목표값입니다. 당월 계산은 마지막 목표 월 값이 적용됩니다." />
                    </label>
                    <div className="relative">
                      <input
                        className={`${inputWithUnitClass} disabled:bg-slate-100 disabled:text-slate-500`}
                        placeholder={
                          aggregationTypeB === "cumulative"
                            ? "월별 추가 목표값 합계로 자동 적용"
                            : "마지막 목표 월 값으로 자동 적용"
                        }
                        value={automaticTargetValueTextB}
                        disabled
                        readOnly
                      />
                      {automaticTargetValueTextB.trim() ? (
                        <UnitSuffixNearValue value={automaticTargetValueTextB} unit={unitSuffixB} />
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {aggregationTypeB === "cumulative"
                        ? "자동 적용값: 월별 추가 목표값 합계"
                        : "자동 적용값: 마지막 목표 월 값"}
                    </p>
                    {fieldErrors["2-targetValue"] ? (
                      <p className="mt-1 text-[11px] text-red-600">{fieldErrors["2-targetValue"]}</p>
                    ) : null}
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
                    value={periodStartMonthB}
                    onChange={(e) => {
                      const nextStart = Number(e.target.value);
                      const nextEnd = Math.max(nextStart, periodEndMonthB);
                      setPeriodStartMonthB(nextStart);
                      setPeriodEndMonthB(nextEnd);
                      setMonthlyTargetTextByMonthB((prev) => targetMapForRange(nextStart, nextEnd, prev));
                      setMonthlyTargetNoteByMonthB((prev) => targetMapForRange(nextStart, nextEnd, prev));
                    }}
                  >
                    {PERIOD_MONTH_OPTIONS.map((m) => (
                      <option key={`b-start-${m}`} value={m}>
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
                    value={periodEndMonthB}
                    onChange={(e) => {
                      const nextEnd = Number(e.target.value);
                      const nextStart = Math.min(periodStartMonthB, nextEnd);
                      setPeriodStartMonthB(nextStart);
                      setPeriodEndMonthB(nextEnd);
                      setMonthlyTargetTextByMonthB((prev) => targetMapForRange(nextStart, nextEnd, prev));
                      setMonthlyTargetNoteByMonthB((prev) => targetMapForRange(nextStart, nextEnd, prev));
                      if (usesComputedTargetB) {
                        setTargetValueTextB(monthlyTargetTextByMonthB[nextEnd] ?? "");
                      }
                    }}
                  >
                    {PERIOD_MONTH_OPTIONS.map((m) => (
                      <option key={`b-end-${m}`} value={m}>
                        {periodMonthLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors["2-periodRange"] ? (
                  <p className="mt-1 text-[11px] text-red-600 lg:col-span-3">{fieldErrors["2-periodRange"]}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-4">
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-600">월별 목표값 설정 (두 번째)</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {aggregationTypeB === "cumulative"
                      ? "누적 계산은 각 월에 추가로 달성해야 하는 목표량을 입력합니다. 예: 1월 1건, 4월 2건이면 4월 목표선은 누적 3건입니다."
                      : "목표가 있는 월만 입력할 수 있습니다. 공백 월은 선택한 공백 처리 규칙에 따라 제외하거나 직전 목표를 유지합니다. 모두 비우면 두 번째 KPI 행은 만들지 않습니다."}
                  </p>
                </div>
                <div className="space-y-1.5 pr-1">
                  {Array.from({ length: periodEndMonthB - periodStartMonthB + 1 }, (_, idx) => {
                    const month = periodStartMonthB + idx;
                    return (
                      <div
                        key={`monthly-target-b2-${month}`}
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
                              value={monthlyTargetTextByMonthB[month] ?? ""}
                              onChange={(e) => {
                                const sanitized = sanitizeNumericInput(e.target.value);
                                setMonthlyTargetTextByMonthB((prev) => ({ ...prev, [month]: sanitized }));
                                if (usesComputedTargetB && month === periodEndMonthB) {
                                  setTargetValueTextB(sanitized);
                                }
                              }}
                            />
                            {(monthlyTargetTextByMonthB[month] ?? "").trim() ? (
                              <UnitSuffixNearValue
                                value={monthlyTargetTextByMonthB[month] ?? ""}
                                unit={unitSuffixB}
                              />
                            ) : null}
                          </div>
                          {fieldErrors[`2-monthlyTarget-${month}`] ? (
                            <p className="mt-1 text-[11px] text-red-600">
                              {fieldErrors[`2-monthlyTarget-${month}`]}
                            </p>
                          ) : null}
                        </div>
                        <input
                          className={inputClass}
                          maxLength={40}
                          placeholder="목표 말풍선 (예: 검토, 제작)"
                          value={monthlyTargetNoteByMonthB[month] ?? ""}
                          onChange={(e) =>
                            setMonthlyTargetNoteByMonthB((prev) => ({
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
          ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,560px)]">
            {isEditMode && hasLinkedSecondaryInEdit ? (
              <div className="xl:col-span-2">
                <div
                  className="mb-1 inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 p-1"
                  role="group"
                  aria-label="수정할 목표 선택"
                >
                  <button
                    type="button"
                    onClick={() => setEditGoalTab("primary")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      editGoalTab === "primary"
                        ? "bg-sky-600 text-white"
                        : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    목표 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditGoalTab("secondary")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      editGoalTab === "secondary"
                        ? "bg-sky-600 text-white"
                        : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    목표 2
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  현재 {editGoalTab === "primary" ? "목표 1" : "목표 2"} 내용을 수정 중입니다.
                </p>
              </div>
            ) : null}
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
                    className={isWholeFieldNumericForUnitSuffix(bmText) ? inputWithUnitClass : inputClass}
                    placeholder="예: 전년 82.5, 120k, 신규, 벤치마크 95%"
                    value={bmText}
                    onChange={(e) => setBmText(e.target.value)}
                  />
                  {isWholeFieldNumericForUnitSuffix(bmText) ? (
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
                  <FieldHint text="%, 수율(%), PPM, ea·건·명·k·억, 분(min), 시간(hr), UPH, Cpk 등 프로젝트 단위에 맞게 선택합니다." />
                </label>
                <select
                  className={`${selectClass} w-full ${selectDisabledClass}`}
                  value={baseline}
                  onChange={(e) => {
                    const nextBaseline = e.target.value as BaselineOption;
                    setBaseline(nextBaseline);
                    setDirection(
                      nextBaseline === "PPM" ||
                        nextBaseline === "시간(hr)" ||
                        nextBaseline === "분(min)"
                        ? "lower"
                        : "higher",
                    );
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
                  <FieldHint text="달성률은 최대 100%로 고정됩니다." />
                </label>
                <p className={`${inputClass} bg-slate-50 text-slate-600`}>100% 제한</p>
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

            <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-4">
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-600">
                  월별 목표값 설정{!isEditMode ? " (첫 번째)" : ""}
                </p>
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
          )}

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
          {!isEditMode && wizardStep === 2 ? (
            <>
              <span
                className={
                  nextWeightSumDual <= 100
                    ? nextWeightSumDual === 100
                      ? "text-emerald-700"
                      : "text-amber-700"
                    : "text-red-700"
                }
              >
                {nextWeightSumDual <= 100
                  ? nextWeightSumDual === 100
                    ? `첫·두 목표 가중치 합계 ${nextWeightSumDual}/100 (정상)`
                    : `첫·두 목표 가중치 합계 ${nextWeightSumDual}/100 (${100 - nextWeightSumDual}점 미배분)`
                  : `첫·두 목표 가중치 합계 ${nextWeightSumDual}/100 (${nextWeightSumDual - 100}점 초과)`}
              </span>
              <p className="mt-1 text-[11px] text-slate-500">
                두 번째 목표를 쓰지 않으면 1단계 가중치만 적용됩니다.
              </p>
            </>
          ) : (
            <>
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
              <p className="mt-1 text-[11px] text-slate-500">
                100 초과는 저장할 수 없고, 100 미만은 저장 가능(경고)합니다.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-sky-200 px-5 py-4">
          {!isEditMode && wizardStep === 1 ? (
            <label className="mr-auto inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={keepTyping}
                onChange={(e) => setKeepTyping(e.target.checked)}
              />
              저장 후 계속 입력
            </label>
          ) : !isEditMode && wizardStep === 2 ? (
            <button
              type="button"
              className="mr-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              onClick={goBackToWizardStep1}
            >
              ← 1단계로
            </button>
          ) : (
            <div className="mr-auto" />
          )}
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" onClick={onClose}>
            취소
          </button>
          {!isEditMode && wizardStep === 1 ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 disabled:opacity-60"
                onClick={() => void handleSubmitPrimary()}
                disabled={submitting}
              >
                저장 (첫 목표만)
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={handleStep1Next}
                disabled={submitting}
              >
                다음 · 두 번째 목표
              </button>
            </>
          ) : !isEditMode && wizardStep === 2 ? (
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleSubmitFromStep2()}
              disabled={submitting}
            >
              저장
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleSubmitEdit()}
              disabled={submitting}
            >
              수정 저장
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
