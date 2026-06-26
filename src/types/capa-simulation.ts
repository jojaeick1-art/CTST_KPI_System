import type { CapaRecipe, ThroughputBasis } from "@/src/types/capa-recipe";
import type { ShiftSelection, SimulationCalendar } from "@/src/types/capa-shift";

export type ProcessOverride = {
  ctSec?: number;
  stdUph?: number;
  throughputBasis?: ThroughputBasis;
  uptimeRate?: number;
  equipmentCount?: number;
};

export type RecipeOverrideMap = Record<string, ProcessOverride>;

export type SingleSimInput = {
  recipe: CapaRecipe;
  overrides?: RecipeOverrideMap;
  targetQty: number;
  shiftSelection: ShiftSelection;
  calendar: SimulationCalendar;
};

export type ProcessSimResult = {
  processId: string;
  processName: string;
  seqNo: number;
  ctSec: number;
  stdUph?: number;
  throughputBasis?: ThroughputBasis;
  uptimeRate: number;
  equipmentCount: number;
  capacityUnits: number;
  loadRate: number;
  shortageUnits: number;
  isBottleneck: boolean;
};

export type LineSimResult = {
  targetQty: number;
  lineCapacityUnits: number;
  overloadRate: number;
  bottleneckProcessId: string;
  bottleneckProcessName: string;
  /** 목표 달성에 필요한 총 소요 일수 */
  requiredCalendarDays: number;
  requiredMinutes: number;
  /** CAPA 산출에 사용한 시뮬레이션 기간(연속 일수) */
  periodCalendarDays: number;
  processes: ProcessSimResult[];
};

export type TrafficLight = "green" | "yellow" | "red";
