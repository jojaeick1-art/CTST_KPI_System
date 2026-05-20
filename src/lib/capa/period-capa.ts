import { applyRecipeOverrides } from "@/src/lib/capa/recipe-overrides";
import { calcProcessSimulation } from "@/src/lib/capa/process-capacity";
import { lineBottleneckCapacity } from "@/src/lib/capa/line-simulation";
import {
  simulationCalendar,
  todayYmd,
  totalNominalMinutesInCalendar,
} from "@/src/lib/capa/shift-calendar";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap } from "@/src/types/capa-simulation";
import type { ShiftSelection, SimulationCalendar } from "@/src/types/capa-shift";

export type PeriodCapaBreakdown = {
  daily: number;
  monthly: number;
  yearly: number;
  monthDays: number;
  yearDays: number;
};

function lineCapacityForCalendar(
  recipe: CapaRecipe,
  shiftSelection: ShiftSelection,
  calendar: SimulationCalendar
): number {
  const totalNominalMinutes = totalNominalMinutesInCalendar(
    calendar,
    shiftSelection
  );
  if (totalNominalMinutes <= 0) return 0;

  const processes = recipe.processes
    .filter((p) => p.isActive !== false)
    .map((p) =>
      calcProcessSimulation({
        process: p,
        effectiveMinutes: totalNominalMinutes,
        targetQty: 0,
      })
    );

  return lineBottleneckCapacity(processes.map((p) => p.capacityUnits));
}

/** 교대·레시피(및 선택적 What-If) 기준 일·월·년 라인 CAPA */
export function computeLinePeriodCapa(input: {
  recipe: CapaRecipe;
  overrides?: RecipeOverrideMap;
  shiftSelection: ShiftSelection;
  startDate?: string;
  monthDays?: number;
  yearDays?: number;
}): PeriodCapaBreakdown {
  const recipe = applyRecipeOverrides(input.recipe, input.overrides);
  const start = input.startDate ?? todayYmd();
  const monthDays = Math.max(1, input.monthDays ?? 30);
  const yearDays = Math.max(monthDays, input.yearDays ?? 365);

  return {
    daily: lineCapacityForCalendar(
      recipe,
      input.shiftSelection,
      simulationCalendar(1, start)
    ),
    monthly: lineCapacityForCalendar(
      recipe,
      input.shiftSelection,
      simulationCalendar(monthDays, start)
    ),
    yearly: lineCapacityForCalendar(
      recipe,
      input.shiftSelection,
      simulationCalendar(yearDays, start)
    ),
    monthDays,
    yearDays,
  };
}
