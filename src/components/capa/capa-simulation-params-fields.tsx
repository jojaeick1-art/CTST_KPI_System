"use client";

import { CalendarClock } from "lucide-react";
import {
  capaToolbarInputClass,
  capaToolbarSecondaryButtonClass,
} from "@/src/components/capa/capa-input-classes";

export function CapaSimulationParamsFields({
  workDays,
  onWorkDaysChange,
  targetQty,
  onTargetQtyChange,
  shiftSummary,
  shiftPlaceholder,
  onOpenShiftModal,
}: {
  workDays: number;
  onWorkDaysChange: (days: number) => void;
  targetQty: number;
  onTargetQtyChange: (qty: number) => void;
  shiftSummary: string;
  shiftPlaceholder?: string;
  onOpenShiftModal: () => void;
}) {
  return (
    <>
      <label className="flex w-24 flex-col gap-1">
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

      <label className="flex min-w-[140px] flex-col gap-1">
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
    </>
  );
}
