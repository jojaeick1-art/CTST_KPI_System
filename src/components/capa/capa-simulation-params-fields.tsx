"use client";

import { CalendarClock } from "lucide-react";
import {
  capaToolbarInputClass,
  capaToolbarSecondaryButtonClass,
} from "@/src/components/capa/capa-input-classes";

export function CapaSimulationParamsFields({
  arrayMultiplier,
  onArrayMultiplierChange,
  arrayDisabled = false,
  workDays,
  onWorkDaysChange,
  targetQty,
  onTargetQtyChange,
  shiftSummary,
  shiftPlaceholder,
  onOpenShiftModal,
  layoutClassName,
  arrayWidthClassName,
  workDaysWidthClassName,
  targetWidthClassName,
}: {
  arrayMultiplier: number;
  onArrayMultiplierChange: (value: number) => void;
  arrayDisabled?: boolean;
  workDays: number;
  onWorkDaysChange: (days: number) => void;
  targetQty: number;
  onTargetQtyChange: (qty: number) => void;
  shiftSummary: string;
  shiftPlaceholder?: string;
  onOpenShiftModal: () => void;
  layoutClassName?: string;
  arrayWidthClassName?: string;
  workDaysWidthClassName?: string;
  targetWidthClassName?: string;
}) {
  return (
    <div className={layoutClassName ?? "contents"}>
      <label className={`flex ${arrayWidthClassName ?? "w-24"} flex-col gap-1`}>
        <span className="text-xs font-medium text-slate-600">배열</span>
        <input
          type="number"
          min={1}
          step={1}
          disabled={arrayDisabled}
          className={capaToolbarInputClass}
          value={arrayMultiplier}
          onChange={(e) => onArrayMultiplierChange(Number(e.target.value))}
          title="연배(1=1연배)"
        />
      </label>

      <label className={`flex ${workDaysWidthClassName ?? "w-24"} flex-col gap-1`}>
        <span className="text-xs font-medium text-slate-600">월 근무일수</span>
        <input
          type="number"
          min={1}
          className={capaToolbarInputClass}
          value={workDays}
          onChange={(e) =>
            onWorkDaysChange(Math.max(1, Number(e.target.value) || 1))
          }
        />
      </label>

      <label className={`flex ${targetWidthClassName ?? "min-w-[140px]"} flex-col gap-1`}>
        <span className="text-xs font-medium text-slate-600">목표 수량</span>
        <input
          type="number"
          min={0}
          className={`w-full ${capaToolbarInputClass}`}
          value={targetQty || ""}
          onChange={(e) =>
            onTargetQtyChange(Math.max(0, Number(e.target.value) || 0))
          }
        />
      </label>

      <div className="flex w-fit shrink-0 flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">근무조</span>
        <button
          type="button"
          onClick={onOpenShiftModal}
          className={capaToolbarSecondaryButtonClass}
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-sky-600" />
          {shiftPlaceholder ?? shiftSummary}
        </button>
      </div>
    </div>
  );
}
