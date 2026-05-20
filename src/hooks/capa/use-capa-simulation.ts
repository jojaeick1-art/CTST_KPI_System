"use client";

import { useMemo } from "react";
import { runSingleSimulation } from "@/src/lib/capa";
import { simulationCalendar } from "@/src/lib/capa/shift-calendar";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap, LineSimResult } from "@/src/types/capa-simulation";
import type { ShiftSelection } from "@/src/types/capa-shift";

export function useCapaSimulation(input: {
  recipe: CapaRecipe | null;
  targetQty: number;
  shiftSelection: ShiftSelection;
  shiftConfigured?: boolean;
  workDays: number;
  weekdayRun: boolean;
  weekendRun: boolean;
  overrides?: RecipeOverrideMap;
}): {
  calendar: ReturnType<typeof simulationCalendar>;
  shiftSelection: ShiftSelection;
  /** 목표 수량이 있을 때만 (라인 CAPA·플로우용) */
  result: LineSimResult | null;
  /** 근무조 확정 시 공정 상세용 (목표 수량 0이어도 산출) */
  processResult: LineSimResult | null;
} {
  const calendar = useMemo(
    () => simulationCalendar(input.workDays),
    [input.workDays]
  );

  const shiftSelection = useMemo(() => {
    const base = input.shiftSelection;
    return {
      weekday: input.weekdayRun ? base.weekday : [],
      weekend: input.weekendRun ? base.weekend : [],
    };
  }, [input.shiftSelection, input.weekdayRun, input.weekendRun]);

  const processResult = useMemo(() => {
    if (!input.recipe || input.shiftConfigured === false) return null;
    const hasShifts =
      shiftSelection.weekday.length > 0 || shiftSelection.weekend.length > 0;
    if (!hasShifts) return null;

    return runSingleSimulation({
      recipe: input.recipe,
      overrides: input.overrides,
      targetQty: Math.max(0, input.targetQty),
      shiftSelection,
      calendar,
    });
  }, [
    input.recipe,
    input.overrides,
    input.targetQty,
    input.shiftConfigured,
    shiftSelection,
    calendar,
  ]);

  const result =
    processResult && input.targetQty > 0 ? processResult : null;

  return { calendar, shiftSelection, result, processResult };
}
