"use client";

import { useMemo, useState } from "react";
import type { CreateManualKpiInput, KpiIndicatorType } from "@/src/lib/kpi-queries";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  deptId: string;
  deptName: string;
  currentWeightSum: number;
  mainTopicOptions: string[];
  subTopicOptions: string[];
  onSubmit: (payload: CreateManualKpiInput) => Promise<void>;
  submitting: boolean;
};

type BaselineOption = "%" | "일정" | "ppm" | "건" | "수량(k)" | "금액";
type DirectionOption = "higher" | "lower";

const BASELINE_OPTIONS: BaselineOption[] = [
  "%",
  "일정",
  "ppm",
  "건",
  "수량(k)",
  "금액",
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
  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
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
  const [h1TargetValueText, setH1TargetValueText] = useState("");
  const [h2TargetValueText, setH2TargetValueText] = useState("");
  const [h1TargetText, setH1TargetText] = useState("");
  const [h2TargetText, setH2TargetText] = useState("");
  const [targetValueText, setTargetValueText] = useState("");
  const [periodStartMonth, setPeriodStartMonth] = useState(1);
  const [periodEndMonth, setPeriodEndMonth] = useState(12);
  const [targetFinalValueText, setTargetFinalValueText] = useState("");
  const [keepTyping, setKeepTyping] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const weightNum = parseNumberOrNull(weightText);
  const nextWeightSum = (weightNum ?? 0) + currentWeightSum;
  const supportsDirection = baseline !== "일정";
  const usesComputedTarget =
    baseline === "ppm" ||
    baseline === "수량(k)" ||
    baseline === "건" ||
    baseline === "금액";

  const weightStatus = useMemo(() => {
    if (nextWeightSum === 100) return "ok";
    if (nextWeightSum > 100) return "over";
    return "under";
  }, [nextWeightSum]);

  if (!isOpen) return null;

  function validate() {
    const errors: Record<string, string> = {};
    const weight = parseNumberOrNull(weightText);
    const h1TargetValue = parseNumberOrNull(h1TargetValueText);
    const h2TargetValue = h2TargetValueText.trim()
      ? parseNumberOrNull(h2TargetValueText)
      : null;
    const targetFinalValue = parseNumberOrNull(targetFinalValueText);
    if (!mainTopic.trim()) errors.mainTopic = "대분류를 입력해 주세요.";
    if (!subTopic.trim()) errors.subTopic = "소분류를 입력해 주세요.";
    if (!detailActivity.trim()) errors.detailActivity = "세부 내용을 입력해 주세요.";
    if (!owner.trim()) errors.owner = "담당자를 입력해 주세요.";
    if (!weight || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      errors.weight = "가중치는 1~100 사이 정수로 입력해 주세요.";
    }
    if (h1TargetValue === null || h1TargetValue < 0) {
      errors.h1TargetValue = "상반기 목표값은 0 이상 숫자로 입력해 주세요.";
    }
    if (h2TargetValue !== null && h2TargetValue < 0) {
      errors.h2TargetValue = "하반기 목표값은 0 이상 숫자로 입력해 주세요.";
    }
    if (targetFinalValue === null || targetFinalValue < 0) {
      errors.targetFinalValue = "최종목표값은 0 이상 숫자로 입력해 주세요.";
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
    const targetValue = parseNumberOrNull(targetValueText);
    const autoTargetValue =
      indicatorType !== "normal"
        ? parseNumberOrNull(targetFinalValueText)
        : targetValue;
    if (indicatorType !== "normal" && (autoTargetValue === null || autoTargetValue <= 0)) {
      errors.targetValue = "자동 계산용 목표값을 0보다 큰 숫자로 입력해 주세요.";
    }
    if (h1TargetValue !== null && targetFinalValue !== null) {
      const expectedHigher = !supportsDirection || direction === "higher";
      if (expectedHigher) {
        if (h1TargetValue > targetFinalValue) {
          errors.h1TargetValue = "진척형 기준에서 상반기 목표값은 최종목표값보다 클 수 없습니다.";
        }
        if (
          h2TargetValue !== null &&
          (h1TargetValue > h2TargetValue || h2TargetValue > targetFinalValue)
        ) {
          errors.h2TargetValue =
            "진척형은 상반기 <= 하반기(선택) <= 최종목표값 순서로 입력해 주세요.";
        }
      } else {
        if (h1TargetValue < targetFinalValue) {
          errors.h1TargetValue = "역지표 기준에서 상반기 목표값은 최종목표값보다 작을 수 없습니다.";
        }
        if (
          h2TargetValue !== null &&
          (h1TargetValue < h2TargetValue || h2TargetValue < targetFinalValue)
        ) {
          errors.h2TargetValue =
            "역지표는 상반기 >= 하반기(선택) >= 최종목표값 순서로 입력해 주세요.";
        }
      }
    }
    setFieldErrors(errors);
    return {
      errors,
      weight,
      h1TargetValue,
      h2TargetValue,
      indicatorType,
      targetValue: autoTargetValue,
      targetFinalValue,
    };
  }

  function resetForNext() {
    setSubTopic("");
    setDetailActivity("");
    setWeightText("");
    setH1TargetValueText("");
    setH2TargetValueText("");
    setH1TargetText("");
    setH2TargetText("");
    setTargetValueText("");
    setTargetFinalValueText("");
    setPeriodStartMonth(1);
    setPeriodEndMonth(12);
    setFieldErrors({});
  }

  async function handleSubmit() {
    const {
      errors,
      weight,
      h1TargetValue,
      h2TargetValue,
      indicatorType,
      targetValue,
      targetFinalValue,
    } =
      validate();
    if (Object.keys(errors).length > 0) return;
    if (
      weight === null ||
      h1TargetValue === null ||
      targetFinalValue === null ||
      targetValue === null
    ) {
      return;
    }

    await onSubmit({
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
      targetDirection: supportsDirection
        ? direction === "lower"
          ? "down"
          : "up"
        : "na",
      targetValue: indicatorType === "normal" ? null : targetValue,
      periodStartMonth,
      periodEndMonth,
      targetFinalValue,
      h1TargetValue,
      h2TargetValue,
      h1TargetText: h1TargetText.trim() || `상반기 ${h1TargetValue}${baseline}`,
      h2TargetText:
        h2TargetValue !== null
          ? h2TargetText.trim() || `하반기 ${h2TargetValue}${baseline}`
          : "",
    });
    if (keepTyping) {
      resetForNext();
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-sky-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">KPI 항목 추가</h3>
          <p className="mt-1 text-xs text-slate-500">
            {deptName} · 필수 입력만 채우면 자동 계산됩니다.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 p-5 sm:grid-cols-2">
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
            <FieldHint text="일정은 계획 대비 진척률(%)로 입력합니다. ppm은 낮을수록 유리하고, 건/수량(k)은 높을수록 유리합니다." />
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
                nextBaseline === "금액";
              if (nextUsesComputed) {
                setTargetValueText(targetFinalValueText);
              } else {
                setTargetValueText("");
              }
            }}
          >
            {BASELINE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {supportsDirection ? (
            <select
              className={selectClass}
              value={direction}
              onChange={(e) => setDirection(e.target.value as DirectionOption)}
            >
              <option value="higher">높을수록 좋음</option>
              <option value="lower">낮을수록 좋음</option>
            </select>
          ) : (
            <div>
              <select className={selectClass} value="disabled" disabled>
                <option value="disabled">비활성화</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                일정 기준은 측정 방향 선택이 비활성화됩니다.
              </p>
            </div>
          )}
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
                <FieldHint text="ppm/건/수량(k)/금액 기준에서는 최종목표값과 동일하게 자동 적용됩니다." />
              </label>
              <div className="sm:col-span-2">
                <input
                  className={inputClass}
                  placeholder="최종목표값과 동일하게 자동 적용"
                  value={targetFinalValueText}
                  disabled
                  readOnly
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  자동 적용값: 최종목표값 입력값과 동일
                </p>
                {fieldErrors.targetValue ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.targetValue}</p> : null}
              </div>
            </>
          ) : (
            <></>
          )}
          <p className="sm:col-span-2 mt-1 text-xs font-semibold text-slate-500">상·하반기 목표</p>
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
              onChange={(e) => setPeriodStartMonth(Number(e.target.value))}
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
              onChange={(e) => setPeriodEndMonth(Number(e.target.value))}
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
          <label className="sm:col-span-2 text-xs font-medium text-slate-600">
            최종목표값
            <FieldHint text="평가 종료월 기준 최종 목표값입니다. 예: 최종 90%. 상/하반기 목표값과 합산하는 개념이 아닙니다." />
          </label>
          <div className="sm:col-span-2">
            <input
              className={inputClass}
              placeholder="최종목표값 입력"
              value={targetFinalValueText}
              onChange={(e) => {
                const sanitized = sanitizeNumericInput(e.target.value);
                setTargetFinalValueText(sanitized);
                if (usesComputedTarget) setTargetValueText(sanitized);
              }}
            />
            {fieldErrors.targetFinalValue ? (
              <p className="mt-1 text-[11px] text-red-600">{fieldErrors.targetFinalValue}</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                숫자만 입력해 주세요. 단위/기호(%, ppm, 건, k)는 입력하지 않습니다.
              </p>
            )}
          </div>
          <label className="text-xs font-medium text-slate-600">
            상반기 목표값
            <FieldHint text="중간 누적 목표값입니다. 예: 최종 90%일 때 상반기 50~60%처럼 입력합니다. 하반기 값과 더해 90을 만들 필요는 없습니다." />
          </label>
          <label className="text-xs font-medium text-slate-600">
            하반기 목표값
            <FieldHint text="연말(또는 종료 구간) 누적 목표값입니다. 선택 입력이며, 비우면 상반기 목표값→최종목표값 구간으로 목표선이 이어집니다." />
          </label>
          <div>
            <input
              className={inputClass}
              placeholder="상반기 목표값"
              value={h1TargetValueText}
              onChange={(e) => setH1TargetValueText(sanitizeNumericInput(e.target.value))}
            />
            {fieldErrors.h1TargetValue ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.h1TargetValue}</p> : null}
          </div>
          <div>
            <input
              className={inputClass}
              placeholder="하반기 목표값(선택)"
              value={h2TargetValueText}
              onChange={(e) => setH2TargetValueText(sanitizeNumericInput(e.target.value))}
            />
            {fieldErrors.h2TargetValue ? <p className="mt-1 text-[11px] text-red-600">{fieldErrors.h2TargetValue}</p> : null}
          </div>
          <input className={inputClass} placeholder="상반기 목표 멘트(선택)" value={h1TargetText} onChange={(e) => setH1TargetText(e.target.value)} />
          <input className={inputClass} placeholder="하반기 목표 멘트(선택)" value={h2TargetText} onChange={(e) => setH2TargetText(e.target.value)} />
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
          <p className="mt-1 text-[11px] text-slate-500">
            100 초과는 저장할 수 없고, 100 미만은 저장 가능(경고)합니다.
          </p>
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-sky-100 px-5 py-4">
          <label className="mr-auto inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={keepTyping}
              onChange={(e) => setKeepTyping(e.target.checked)}
            />
            저장 후 계속 입력
          </label>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" onClick={onClose}>
            취소
          </button>
          <button
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
