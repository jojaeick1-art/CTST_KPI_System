"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreateManualKpiInput, KpiIndicatorType } from "@/src/lib/kpi-queries";

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
    indicatorType: KpiIndicatorType;
    targetDirection: "up" | "down" | "na";
    periodStartMonth: number | null;
    periodEndMonth: number | null;
    targetPpm: number | null;
    monthlyTargets: Partial<Record<number, number>>;
  } | null;
  onSubmit: (payload: CreateManualKpiInput, options?: { kpiId?: string }) => Promise<void>;
  submitting: boolean;
};

type BaselineOption = "%" | "ppm" | "건" | "수량(k)" | "금액" | "시간" | "생산성(UPH)";
type DirectionOption = "higher" | "lower";

const BASELINE_OPTIONS: BaselineOption[] = [
  "%",
  "ppm",
  "건",
  "수량(k)",
  "금액",
  "시간",
  "생산성(UPH)",
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

function FieldHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative ml-1 inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200"
        aria-label={text}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
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
          className="absolute left-1/2 top-[120%] z-20 w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-800 px-2 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg"
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

  const [mainTopic, setMainTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [detailActivity, setDetailActivity] = useState("");
  const [baseline, setBaseline] = useState<BaselineOption>("%");
  const [direction, setDirection] = useState<DirectionOption>("higher");
  const [owner, setOwner] = useState("");
  const [weightText, setWeightText] = useState("");
  const [targetValueText, setTargetValueText] = useState("");
  const [periodStartMonth, setPeriodStartMonth] = useState(1);
  const [periodEndMonth, setPeriodEndMonth] = useState(12);
  const [monthlyTargetTextByMonth, setMonthlyTargetTextByMonth] = useState<Record<number, string>>(
    () => targetMapForRange(1, 12, {})
  );
  const [keepTyping, setKeepTyping] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isEditMode = Boolean(editingItem?.id);

  useEffect(() => {
    if (!isOpen) return;
    if (!editingItem) return;
    setMainTopic(editingItem.mainTopic ?? "");
    setSubTopic(editingItem.subTopic ?? "");
    setDetailActivity(editingItem.detailActivity ?? "");
    setOwner(editingItem.owner ?? "");
    setWeightText(editingItem.weight ?? "");
    setPeriodStartMonth(editingItem.periodStartMonth ?? 1);
    setPeriodEndMonth(editingItem.periodEndMonth ?? 12);
    const baselineFromIndicator: BaselineOption =
      editingItem.indicatorType === "ppm"
        ? "ppm"
        : editingItem.indicatorType === "quantity"
          ? "수량(k)"
          : editingItem.indicatorType === "count"
            ? "건"
            : editingItem.indicatorType === "money"
              ? "금액"
              : editingItem.indicatorType === "time"
                ? "시간"
                : editingItem.indicatorType === "uph"
                  ? "생산성(UPH)"
                  : "%";
    setBaseline(baselineFromIndicator);
    setDirection(editingItem.targetDirection === "down" ? "lower" : "higher");
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
    setFieldErrors({});
  }, [isOpen, editingItem]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) return;
    setMainTopic("");
    setSubTopic("");
    setDetailActivity("");
    setBaseline("%");
    setDirection("higher");
    setOwner("");
    setWeightText("");
    setTargetValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setMonthlyTargetTextByMonth(targetMapForRange(1, 12, {}));
    setKeepTyping(false);
    setFieldErrors({});
  }, [isOpen, editingItem]);

  const weightNum = parseNumberOrNull(weightText);
  const nextWeightSum = (weightNum ?? 0) + currentWeightSum;
  const supportsDirection = true;
  const usesComputedTarget =
    baseline === "ppm" ||
    baseline === "수량(k)" ||
    baseline === "건" ||
    baseline === "금액" ||
    baseline === "시간" ||
    baseline === "생산성(UPH)";

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

    let indicatorType: KpiIndicatorType = "normal";
    if (baseline === "ppm") indicatorType = "ppm";
    if (baseline === "수량(k)") indicatorType = "quantity";
    if (baseline === "건") indicatorType = "count";
    if (baseline === "금액") indicatorType = "money";
    if (baseline === "시간") indicatorType = "time";
    if (baseline === "생산성(UPH)") indicatorType = "uph";

    const monthlyTargets: Array<{ month: number; targetValue: number }> = [];
    for (let m = periodStartMonth; m <= periodEndMonth; m += 1) {
      const raw = monthlyTargetTextByMonth[m] ?? "";
      const parsed = parseNumberOrNull(raw);
      if (parsed === null || parsed < 0) {
        errors[`monthlyTarget-${m}`] = `${periodMonthLabel(m)} 목표값을 0 이상 숫자로 입력해 주세요.`;
        continue;
      }
      monthlyTargets.push({ month: m, targetValue: parsed });
    }

    const finalTargetFromMonthly =
      monthlyTargets.length > 0
        ? monthlyTargets[monthlyTargets.length - 1]!.targetValue
        : null;
    const targetValue = parseNumberOrNull(targetValueText);
    const autoTargetValue = indicatorType !== "normal" ? finalTargetFromMonthly : targetValue;
    if (
      indicatorType !== "normal" &&
      (autoTargetValue === null || autoTargetValue <= 0)
    ) {
      errors.targetValue = "자동 계산용 목표값을 0보다 큰 숫자로 입력해 주세요.";
    }

    if (monthlyTargets.length > 1 && supportsDirection) {
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
    setWeightText("");
    setTargetValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setMonthlyTargetTextByMonth(targetMapForRange(1, 12, {}));
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
        baselineLabel: supportsDirection
          ? `${baseline} (${direction === "higher" ? "높을수록 좋음" : "낮을수록 좋음"})`
          : baseline,
        owner,
        weight,
        indicatorType,
        targetDirection: supportsDirection ? (direction === "lower" ? "down" : "up") : "na",
        targetValue: indicatorType === "normal" ? null : targetValue,
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
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-sky-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            {isEditMode ? "KPI 항목 수정" : "KPI 항목 추가"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{deptName} · 월별 목표값 기준으로 목표 그래프를 생성합니다.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="sm:col-span-2 text-xs font-semibold text-slate-500">기본 정보</p>
              <div>
                <input className={inputClass} list="kpi-main-topic-list" placeholder="KPI 대분류" value={mainTopic} onChange={(e) => setMainTopic(e.target.value)} />
                {fieldErrors.mainTopic ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.mainTopic}</p> : null}
              </div>
              <div>
                <input className={inputClass} list="kpi-sub-topic-list" placeholder="KPI 소분류" value={subTopic} onChange={(e) => setSubTopic(e.target.value)} />
                {fieldErrors.subTopic ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.subTopic}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <textarea className={textAreaClass} placeholder="세부 내용" rows={3} value={detailActivity} onChange={(e) => setDetailActivity(e.target.value)} />
                {fieldErrors.detailActivity ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.detailActivity}</p> : null}
              </div>

              <p className="sm:col-span-2 mt-1 text-xs font-semibold text-slate-500">측정 / 담당 / 가중치</p>
              <label className="text-xs font-medium text-slate-600">
                측정 기준
                <FieldHint text="ppm/시간은 보통 낮을수록, 생산성(UPH)/건/수량(k)/금액/%는 보통 높을수록 유리합니다." />
              </label>
              <label className="text-xs font-medium text-slate-600">
                측정 방향
                <FieldHint text="기준이 상승/하락 성격일 때 목표 달성 방향을 선택합니다." />
              </label>

              <select
                className={selectClass}
                value={baseline}
                onChange={(e) => {
                  const nextBaseline = e.target.value as BaselineOption;
                  setBaseline(nextBaseline);
                  setDirection(nextBaseline === "ppm" ? "lower" : "higher");
                  const nextUsesComputed =
                    nextBaseline === "ppm" ||
                    nextBaseline === "수량(k)" ||
                    nextBaseline === "건" ||
                    nextBaseline === "금액" ||
                    nextBaseline === "시간" ||
                    nextBaseline === "생산성(UPH)";
                  if (nextUsesComputed) {
                    setTargetValueText(monthlyTargetTextByMonth[periodEndMonth] ?? "");
                  } else {
                    setTargetValueText("");
                  }
                  if (nextBaseline === "ppm" || nextBaseline === "시간") {
                    setDirection("lower");
                  } else {
                    setDirection("higher");
                  }
                }}
              >
                {BASELINE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              <select className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as DirectionOption)}>
                <option value="higher">높을수록 좋음</option>
                <option value="lower">낮을수록 좋음</option>
              </select>

              <label className="text-xs font-medium text-slate-600">
                가중치
                <FieldHint text="소분류 항목별 1~100 정수 입력. 부서 합계 100 권장." />
              </label>
              <label className="text-xs font-medium text-slate-600">
                담당자
                <FieldHint text="해당 KPI의 담당 그룹장 이름을 입력해 주세요." />
              </label>
              <div>
                <input className={inputClass} placeholder="가중치(1~100)" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
                {fieldErrors.weight ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.weight}</p> : null}
              </div>
              <div>
                <input className={inputClass} placeholder="담당자" value={owner} onChange={(e) => setOwner(e.target.value)} />
                {fieldErrors.owner ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.owner}</p> : null}
              </div>

              {usesComputedTarget ? (
                <>
                  <label className="sm:col-span-2 text-xs font-medium text-slate-600">
                    자동계산 기준값
                    <FieldHint text="ppm/건/수량(k)/금액/시간/UPH 기준에서는 평가 종료월 목표값과 동일하게 자동 적용됩니다." />
                  </label>
                  <div className="sm:col-span-2">
                    <input className={inputClass} placeholder="평가 종료월 목표값과 동일하게 자동 적용" value={targetValueText} disabled readOnly />
                    <p className="mt-1 text-[11px] text-slate-500">자동 적용값: 평가 종료월 목표값</p>
                    {fieldErrors.targetValue ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.targetValue}</p> : null}
                  </div>
                </>
              ) : null}

              <p className="sm:col-span-2 mt-1 text-xs font-semibold text-slate-500">평가 구간</p>
              <label className="text-xs font-medium text-slate-600">
                평가 시작월
                <FieldHint text="실적을 입력받기 시작하는 기준 월입니다." />
              </label>
              <label className="text-xs font-medium text-slate-600">
                평가 종료월
                <FieldHint text="실적 입력 및 달성률 평가를 마감하는 월입니다." />
              </label>
              <div>
                <select
                  className={`${selectClass} w-full`}
                  value={periodStartMonth}
                  onChange={(e) => {
                    const nextStart = Number(e.target.value);
                    const nextEnd = Math.max(nextStart, periodEndMonth);
                    setPeriodStartMonth(nextStart);
                    setPeriodEndMonth(nextEnd);
                    setMonthlyTargetTextByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
                  }}
                >
                  {PERIOD_MONTH_OPTIONS.map((m) => (
                    <option key={`start-${m}`} value={m}>
                      {periodMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  className={`${selectClass} w-full`}
                  value={periodEndMonth}
                  onChange={(e) => {
                    const nextEnd = Number(e.target.value);
                    const nextStart = Math.min(periodStartMonth, nextEnd);
                    setPeriodStartMonth(nextStart);
                    setPeriodEndMonth(nextEnd);
                    setMonthlyTargetTextByMonth((prev) => targetMapForRange(nextStart, nextEnd, prev));
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
                <p className="sm:col-span-2 mt-1 text-[11px] text-red-600">{fieldErrors.periodRange}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-4">
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-600">월별 목표값 설정</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  평가 구간의 각 월 목표값을 입력하면 목표 그래프가 월별로 그려집니다.
                </p>
              </div>
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {Array.from({ length: periodEndMonth - periodStartMonth + 1 }, (_, idx) => {
                  const month = periodStartMonth + idx;
                  return (
                    <div
                      key={`monthly-target-${month}`}
                      className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                    >
                      <label className="text-xs font-medium text-slate-600">
                        {periodMonthLabel(month)}
                      </label>
                      <div>
                        <input
                          className={inputClass}
                          placeholder={`${periodMonthLabel(month)} 목표값`}
                          value={monthlyTargetTextByMonth[month] ?? ""}
                          onChange={(e) => {
                            const sanitized = sanitizeNumericInput(e.target.value);
                            setMonthlyTargetTextByMonth((prev) => ({ ...prev, [month]: sanitized }));
                            if (usesComputedTarget && month === periodEndMonth) {
                              setTargetValueText(sanitized);
                            }
                          }}
                        />
                        {fieldErrors[`monthlyTarget-${month}`] ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            {fieldErrors[`monthlyTarget-${month}`]}
                          </p>
                        ) : null}
                      </div>
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
