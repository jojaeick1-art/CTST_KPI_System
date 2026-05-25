import { applyRecipeOverrides } from "@/src/lib/capa/recipe-overrides";
import { calcProcessSimulation } from "@/src/lib/capa/process-capacity";
import { resolveArrayMultiplier } from "@/src/lib/capa/recipe-normalize";
import {
  buildCalendarDays,
  countCalendarDays,
  extendCalendarToDays,
  totalNominalMinutesInCalendar,
} from "@/src/lib/capa/shift-calendar";
import type { SingleSimInput } from "@/src/types/capa-simulation";
import type { LineSimResult, TrafficLight } from "@/src/types/capa-simulation";

export function trafficLightFromLoad(loadRate: number | null): TrafficLight {
  if (loadRate == null || loadRate <= 0) return "green";
  if (loadRate < 0.85) return "green";
  if (loadRate <= 1) return "yellow";
  return "red";
}

/** 직렬 라인 최소 처리량 */
export function lineBottleneckCapacity(processCapacities: number[]): number {
  if (!processCapacities.length) return 0;
  return Math.min(...processCapacities);
}

/**
 * 목표 수량을 달성하는 최소 달력 일수 (동일 교대·가동률 가정)
 */
export function requiredDaysForTarget(input: {
  targetQty: number;
  dailyLineCapacity: number;
  maxDays?: number;
}): number {
  if (input.targetQty <= 0) return 1;
  if (input.dailyLineCapacity <= 0) return input.maxDays ?? 365;
  return Math.ceil(input.targetQty / input.dailyLineCapacity);
}

/** 단일 레시피 라인 시뮬레이션 */
export function runSingleSimulation(input: SingleSimInput): LineSimResult {
  const recipe = applyRecipeOverrides(input.recipe, input.overrides);
  const arrayMultiplier = resolveArrayMultiplier(recipe.meta);
  const targetQty = Math.max(0, input.targetQty);
  const calendarDays = buildCalendarDays(input.calendar, input.shiftSelection);
  const periodDays = Math.max(1, calendarDays.length || countCalendarDays(input.calendar));

  const totalNominalMinutes = totalNominalMinutesInCalendar(
    input.calendar,
    input.shiftSelection
  );

  const processes = recipe.processes
    .filter((p) => p.isActive !== false)
    .sort((a, b) => a.seqNo - b.seqNo)
    .map((p) =>
      calcProcessSimulation({
        process: p,
        effectiveMinutes: totalNominalMinutes,
        targetQty,
        arrayMultiplier,
      })
    );

  const capacities = processes.map((p) => p.capacityUnits);
  const lineCapacityUnits = lineBottleneckCapacity(capacities);

  let bottleneckIdx = 0;
  let minCap = Infinity;
  processes.forEach((p, i) => {
    if (p.capacityUnits < minCap) {
      minCap = p.capacityUnits;
      bottleneckIdx = i;
    }
  });

  const hasMultipleProcesses = processes.length >= 2;

  const marked = processes.map((p, i) => ({
    ...p,
    isBottleneck: hasMultipleProcesses && i === bottleneckIdx,
  }));

  const bn = hasMultipleProcesses ? marked[bottleneckIdx] : undefined;
  const overloadRate =
    lineCapacityUnits > 0 && targetQty > 0
      ? targetQty / lineCapacityUnits - 1
      : targetQty > 0
        ? Infinity
        : 0;

  const dailyNominal = periodDays > 0 ? totalNominalMinutes / periodDays : 0;
  const dailyLineCap =
    lineCapacityUnits > 0 && totalNominalMinutes > 0
      ? Math.floor(lineCapacityUnits * (dailyNominal / totalNominalMinutes))
      : 0;

  const requiredCalendarDays = requiredDaysForTarget({
    targetQty,
    dailyLineCapacity: dailyLineCap || lineCapacityUnits,
    maxDays: 365,
  });

  const requiredMinutes = totalNominalMinutesInCalendar(
    extendCalendarToDays(input.calendar.startDate, requiredCalendarDays),
    input.shiftSelection
  );

  return {
    targetQty,
    lineCapacityUnits,
    overloadRate: Number.isFinite(overloadRate) ? overloadRate : 999,
    bottleneckProcessId: bn?.processId ?? "",
    bottleneckProcessName: hasMultipleProcesses ? (bn?.processName ?? "—") : "—",
    requiredCalendarDays,
    requiredMinutes,
    periodCalendarDays: periodDays,
    processes: marked,
  };
}
