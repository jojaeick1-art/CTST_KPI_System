"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatShiftSelectionSummary } from "@/src/lib/capa/shift-selection-summary";
import { nominalMinutesForShifts } from "@/src/lib/capa/shift-calendar";
import {
  CAPA_EFFECTIVE_HOURS_PER_FULL_DAY,
  DEFAULT_SHIFT_SELECTION,
  SHIFT_BREAK_MINUTES_12H,
  SHIFT_BREAK_MINUTES_8H,
  slotsForDayKind,
  type DayKind,
  type ShiftSelection,
  type ShiftSlotId,
} from "@/src/types/capa-shift";

export { formatShiftSelectionSummary };

function ShiftToggleGroup({
  dayKind,
  durationHours,
  selected,
  onToggle,
}: {
  dayKind: DayKind;
  durationHours: 8 | 12;
  selected: ShiftSlotId[];
  onToggle: (id: ShiftSlotId, active: boolean) => void;
}) {
  const options = slotsForDayKind(dayKind, durationHours);
  if (!options.length) return null;

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs font-medium text-slate-500">{durationHours}시간</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id, !active)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayKindSection({
  dayKind,
  label,
  run,
  onRunChange,
  selected,
  onChange,
}: {
  dayKind: DayKind;
  label: string;
  run: boolean;
  onRunChange: (v: boolean) => void;
  selected: ShiftSlotId[];
  onChange: (ids: ShiftSlotId[]) => void;
}) {
  function toggle(id: ShiftSlotId, active: boolean) {
    const set = new Set(selected);
    if (active) set.add(id);
    else set.delete(id);
    onChange([...set]);
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={run}
          onChange={(e) => onRunChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600"
        />
        {label}
      </label>
      {run ? (
        <>
          <ShiftToggleGroup
            dayKind={dayKind}
            durationHours={8}
            selected={selected}
            onToggle={toggle}
          />
          <ShiftToggleGroup
            dayKind={dayKind}
            durationHours={12}
            selected={selected}
            onToggle={toggle}
          />
        </>
      ) : null}
    </div>
  );
}

export function ShiftSelectionModal({
  open,
  value,
  weekdayRun,
  weekendRun,
  onChange,
  onWeekdayRunChange,
  onWeekendRunChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: ShiftSelection;
  weekdayRun: boolean;
  weekendRun: boolean;
  onChange: (next: ShiftSelection) => void;
  onWeekdayRunChange: (v: boolean) => void;
  onWeekendRunChange: (v: boolean) => void;
  onClose: () => void;
  onConfirm?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-selection-title"
        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3
              id="shift-selection-title"
              className="text-base font-semibold text-slate-900"
            >
              근무조 선택
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              8시간 교대는 조당 식사 30분, 12시간 교대는 조당 휴게 45분을
              빼고 CAPA에 반영합니다. (8h×3·12h×2 풀 가동 시 일{" "}
              {CAPA_EFFECTIVE_HOURS_PER_FULL_DAY}시간)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] space-y-4 overflow-y-auto px-5 py-4">
          <DayKindSection
            dayKind="weekday"
            label="평일 가동"
            run={weekdayRun}
            onRunChange={onWeekdayRunChange}
            selected={value.weekday}
            onChange={(weekday) => onChange({ ...value, weekday })}
          />

          <DayKindSection
            dayKind="weekend"
            label="주말 가동"
            run={weekendRun}
            onRunChange={onWeekendRunChange}
            selected={value.weekend}
            onChange={(weekend) => onChange({ ...value, weekend })}
          />

          <p className="text-xs text-slate-500">
            미리보기:{" "}
            <span className="font-medium text-slate-700">
              {formatShiftSelectionSummary(value, weekdayRun, weekendRun)}
            </span>
          </p>
          {weekdayRun || weekendRun ? (
            <ul className="text-xs text-slate-500">
              {weekdayRun ? (
                <li>
                  평일 CAPA 가용:{" "}
                  {(nominalMinutesForShifts(value.weekday) / 60).toFixed(1)}
                  시간/일 (8h 조 −{SHIFT_BREAK_MINUTES_8H}분, 12h 조 −
                  {SHIFT_BREAK_MINUTES_12H}분)
                </li>
              ) : null}
              {weekendRun ? (
                <li>
                  주말 CAPA 가용:{" "}
                  {(nominalMinutesForShifts(value.weekend) / 60).toFixed(1)}
                  시간/일
                </li>
              ) : null}
            </ul>
          ) : null}

          <button
            type="button"
            className="text-xs text-sky-700 underline"
            onClick={() => {
              onChange({ ...DEFAULT_SHIFT_SELECTION });
              onWeekdayRunChange(true);
              onWeekendRunChange(true);
            }}
          >
            기본값으로 초기화
          </button>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button
            type="button"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
