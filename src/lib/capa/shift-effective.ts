import type { ShiftSelection } from "@/src/types/capa-shift";

export function effectiveShiftSelection(
  selection: ShiftSelection,
  weekdayRun: boolean,
  weekendRun: boolean
): ShiftSelection {
  return {
    weekday: weekdayRun ? selection.weekday : [],
    weekend: weekendRun ? selection.weekend : [],
  };
}

export function hasEffectiveShiftSelection(
  selection: ShiftSelection,
  weekdayRun: boolean,
  weekendRun: boolean
): boolean {
  const eff = effectiveShiftSelection(selection, weekdayRun, weekendRun);
  return eff.weekday.length > 0 || eff.weekend.length > 0;
}
